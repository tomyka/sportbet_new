import { NO_TOURNAMENT_FACTS, type TournamentFacts } from './tournament-facts';

/** Every rule-dependent line of /help (slice 18, #35). */
export interface HelpPage {
  /** The standings table runs 1 to this; null with no tournament, so no "(1-N)" is printed. */
  readonly tableLength: number | null;
  /** The round whose last result closes the standings (R-106, R-128), null with no tournament. */
  readonly deadlineRound: number | null;
  /** Whether the survival block and the summary's survival line are shown (R-133). */
  readonly survival: boolean;
}

/**
 * Every rule-dependent line of /help, from the facts of the tournament it
 * describes; null where there is none.
 */
export function helpPage(facts: TournamentFacts | null): HelpPage {
  const { teamCount, deadlineRound, survival } = facts ?? NO_TOURNAMENT_FACTS;
  return Object.freeze({ tableLength: teamCount, deadlineRound, survival });
}
