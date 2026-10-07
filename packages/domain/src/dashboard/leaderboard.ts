import type { MatchPrediction } from '../prediction/match-prediction';
import { isExactScore } from '../prediction/match-scoring';
import { rankPlayers } from '../ranking/league-table';
import { isFullyCorrect } from '../serija/serija';
import {
  sumTournamentTotals,
  type PointsRows,
  type StoredMatchRow,
} from '../recalculation/recalculation';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId } from '../shared/ids';

/** One tournament as the leaderboard reads it. */
export interface LeaderboardTournament {
  /** The rule set's stored rows of the tournament. */
  readonly rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'>;
  /** Its players not switched off or hidden (RA-4). */
  readonly listed: ReadonlySet<PlayerId>;
  /**
   * Its match predictions' origins - all it reads of them: a fill-in is
   * never fully correct. A MatchPrediction is one; a loader may read just
   * these columns.
   */
  readonly predictions: readonly Pick<
    MatchPrediction,
    'player' | 'game' | 'origin'
  >[];
  /** Shown to everyone (sportbet's `is_public`). */
  readonly isPublic: boolean;
}

export interface LeaderboardRow {
  readonly player: PlayerId;
  readonly username: string;
  readonly rank: number;
  /** The total the page ranks by, to the cent ("Taškai"). */
  readonly totalCents: number;
  /** Exact scores ("Tikslūs", isExactScore). */
  readonly exact: number;
  /** Fully correct calls, as a serija counts them ("Nugalėtojai", isFullyCorrect). */
  readonly winners: number;
  /** Every match points row, fill-ins included ("Žaidimai"). */
  readonly games: number;
}

/**
 * MainController::leaderboard (PlayerTotals::allTime): every tournament's
 * rows of the players it counts - under R-77 each tournament where a
 * player is listed; under sportbet's one account-wide switch, all of a
 * player's tournaments while they are listed in every one they have rows
 * in - summed (sumTournamentTotals) and ranked as Lyderiai
 * (rankPlayers: match + serija under sportbetRules, the full total under
 * R-18; tie order R-30). A player is on it with at least one counted
 * match points row (eligible's inner join). Under R-77 amended only public
 * tournaments feed it (a non-public one is shown only to its players,
 * R-50); sportbet counts every tournament.
 */
export function leaderboardRows(input: {
  readonly tournaments: readonly LeaderboardTournament[];
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly rules: RuleSet;
}): readonly LeaderboardRow[] {
  const { usernames, rules } = input;
  const tournaments = input.tournaments.filter(
    ({ isPublic }) => isPublic || !rules.leaderboardPublicTournamentsOnly,
  );
  const switchedOffSomewhere = new Set(
    tournaments.flatMap(({ rows, listed }) =>
      [...rows.matches, ...rows.standings, ...rows.survival]
        .map(({ player }) => player)
        .filter((player) => !listed.has(player)),
    ),
  );
  const counts = (tournament: LeaderboardTournament, player: PlayerId) =>
    rules.leaderboardCountsEachListedTournament
      ? tournament.listed.has(player)
      : !switchedOffSomewhere.has(player);

  const matches: StoredMatchRow[] = [];
  const standings: PointsRows['standings'][number][] = [];
  const survival: PointsRows['survival'][number][] = [];
  const winners = new Map<PlayerId, number>();
  for (const tournament of tournaments) {
    const counted = <T extends { readonly player: PlayerId }>(
      rows: readonly T[],
    ) => rows.filter(({ player }) => counts(tournament, player));
    const origin = new Map(
      tournament.predictions.map((p) => [
        `${p.player}/${String(p.game)}`,
        p.origin,
      ]),
    );
    for (const row of counted(tournament.rows.matches)) {
      matches.push(row);
      const from = origin.get(`${row.player}/${String(row.game)}`);
      if (isFullyCorrect(row.points.winner, from ?? null)) {
        winners.set(row.player, (winners.get(row.player) ?? 0) + 1);
      }
    }
    standings.push(...counted(tournament.rows.standings));
    survival.push(...counted(tournament.rows.survival));
  }

  const scored = new Set(matches.map(({ player }) => player));
  const totals = sumTournamentTotals([], { matches, standings, survival });
  const ranked = rankPlayers(
    totals.flatMap((total) => {
      if (!scored.has(total.player)) return [];
      const username = usernames.get(total.player);
      if (username === undefined) {
        throw new Error('leaderboardRows: a counted player has no username');
      }
      return [{ ...total, username, listed: true }];
    }),
    'lyderiai',
    rules,
  );
  return Object.freeze(
    ranked.map(({ player, username, rank, totalCents }) => {
      const own = matches.filter((row) => row.player === player);
      return Object.freeze({
        player,
        username,
        rank,
        totalCents,
        exact: own.filter(({ points }) => isExactScore(points)).length,
        winners: winners.get(player) ?? 0,
        games: own.length,
      });
    }),
  );
}
