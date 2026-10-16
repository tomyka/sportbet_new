import { z } from 'zod';
import { standingsDeadlineRoundOf } from '../round/season';
import type { Tournament } from '../tournament/tournament';

/**
 * What /rules and /help state of the tournament they describe (slice 18,
 * #35, R-106, R-133): the table's length, the round whose last result closes
 * the standings (ST-2) and the survival switch. Null where there is no
 * tournament to describe.
 */
export const tournamentFactsSchema = z.object({
  /** How many teams the standings table runs over. */
  teamCount: z.int().min(0).nullable(),
  /** The tournament's own deadline round, else the default (ST-2). */
  deadlineRound: z.int().min(1).nullable(),
  /** The tournament's survival switch; false with no tournament. */
  survival: z.boolean(),
});

export type TournamentFacts = z.infer<typeof tournamentFactsSchema>;

/** The facts of no tournament: both pages still answer, without the table length, the deadline round and survival (R-133). */
export const NO_TOURNAMENT_FACTS: TournamentFacts = Object.freeze({
  teamCount: null,
  deadlineRound: null,
  survival: false,
});

/** The facts of a tournament and the number of teams its table runs over. */
export function tournamentFacts(
  tournament: Tournament,
  teamCount: number,
): TournamentFacts {
  return {
    teamCount,
    deadlineRound: standingsDeadlineRoundOf(tournament.standingsDeadlineRound),
    survival: tournament.survival,
  };
}
