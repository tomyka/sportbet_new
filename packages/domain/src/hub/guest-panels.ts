import type { PlayerStatus } from '../player/player-status';
import { rankPlayers } from '../ranking/league-table';
import type { TournamentTotal } from '../recalculation/recalculation';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId, TournamentId } from '../shared/ids';
import { tallyMedals, type MedalRow } from './medal-tally';

/** One player's final place (1 to 4) for one team, by the team's name. */
export interface FinalPlacePick {
  readonly player: PlayerId;
  readonly team: string;
  readonly finalPlace: number;
}

/** What the guest panels are decided from: one tournament's stored rows under one rule set. */
export interface GuestPanelsInput {
  readonly tournament: TournamentId;
  /** The players' totals of the rule set's stored rows (sumTournamentTotals). */
  readonly totals: readonly TournamentTotal[];
  /** The players with a match points row of the rule set's source. */
  readonly scored: ReadonlySet<PlayerId>;
  readonly usernames: ReadonlyMap<PlayerId, string>;
  /** Each player's status in the tournament; a player without one is not listed. */
  readonly statuses: ReadonlyMap<PlayerId, PlayerStatus>;
  readonly finalPlaces: readonly FinalPlacePick[];
  readonly rules: RuleSet;
}

/** One line of "Lyderiai". */
export interface LeaderLine {
  readonly rank: number;
  readonly username: string;
  /** The total the page ranks by, to the cent (leaderPoints prints it). */
  readonly totalCents: number;
}

/** "Lyderiai" and "Finalų prognozės". */
export interface GuestPanelsDecided {
  readonly leaders: readonly LeaderLine[];
  readonly medals: readonly MedalRow[];
}

const LEADERS_SHOWN = 5;

/**
 * The hub's guest panels. "Lyderiai" is PlayerTotals::forTournament(...)
 * ->limit(5), ranked: the players with a match points row (PlayerTotals::
 * eligible's inner join on point_results), listed (RA-4: not switched off,
 * not hidden), in rankPlayers' Lyderiai order (RA-1, R-18; RA-3, R-30),
 * the first five. "Finalų prognozės" is MedalTally::forTournament: the
 * listed players' final places by team (tallyMedals).
 */
export function guestPanels(input: GuestPanelsInput): GuestPanelsDecided {
  const { tournament, rules } = input;
  const listed = (who: PlayerId) =>
    input.statuses.get(who)?.isListedIn(tournament, rules) ?? false;
  const eligible = input.totals.flatMap((total) => {
    if (!input.scored.has(total.player)) return [];
    const username = input.usernames.get(total.player);
    if (username === undefined) {
      throw new Error('guestPanels: a scored player has no username');
    }
    return [{ ...total, username, listed: listed(total.player) }];
  });
  const leaders = rankPlayers(eligible, 'lyderiai', rules)
    .slice(0, LEADERS_SHOWN)
    .map(({ rank, username, totalCents }) =>
      Object.freeze({ rank, username, totalCents }),
    );
  return Object.freeze({
    leaders: Object.freeze(leaders),
    medals: tallyMedals(
      input.finalPlaces.filter(({ player }) => listed(player)),
    ),
  });
}
