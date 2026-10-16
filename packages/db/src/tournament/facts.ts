import type { StandingsCloses, Tournament } from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';

/**
 * What /rules and /help state of the tournament they describe (slice 18,
 * #35, R-106, R-133).
 */
export interface TournamentFacts {
  /** How many teams the standings table runs over. */
  readonly teamCount: number;
  /** The round whose last result closes the standings: the tournament's own, else the default (ST-2). */
  readonly deadlineRound: number;
  /** `never` while no game is at or after that round, else `open` or `closed`. */
  readonly standingsCloses: StandingsCloses;
  /** The tournament's survival switch. */
  readonly survival: boolean;
}

/**
 * The facts of any tournament, from its team list and its loaded season
 * (Season holds the deadline round and its default, and decides whether the
 * standings close): the one read behind a player's and a visitor's rules and
 * help pages.
 */
export async function loadTournamentFacts(
  db: Executor,
  tournament: Tournament,
): Promise<TournamentFacts> {
  const season = await loadSeason(db, tournament);
  return {
    teamCount: (await listTeams(db, tournament)).length,
    deadlineRound: season.standingsDeadlineRound,
    standingsCloses: season.standingsCloses(),
    survival: tournament.survival,
  };
}
