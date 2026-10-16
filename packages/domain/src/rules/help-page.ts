import { STANDINGS_COUNTS } from '../standings/standings-prediction';
import type { StandingsCloses } from '../standings/standings-view';

/** What /help states of the tournament it describes; null where there is none. */
export interface HelpFacts {
  readonly teamCount: number | null;
  readonly deadlineRound: number | null;
  readonly standingsCloses: StandingsCloses | null;
  /** The tournament's survival switch; false with no tournament. */
  readonly survival: boolean;
}

/** Every figure and rule-dependent line of /help (slice 18, #35). */
export interface HelpPage {
  /** The standings table runs 1 to this; null with no tournament, so no "(1-N)" is printed. */
  readonly tableLength: number | null;
  /** The round whose last result closes the standings (R-106, R-128), null with no tournament. */
  readonly deadlineRound: number | null;
  /** Whether that round has a game yet: `never`, `open` or `closed`. */
  readonly standingsCloses: StandingsCloses | null;
  /** How many places the final names (ST-1). */
  readonly finalPlaces: number;
  /**
   * A short standings table is saved (the standings save's row saves, "an
   * incomplete table is accepted"): sportbet's own help says otherwise
   * (R-106, R-133).
   */
  readonly partialTableAccepted: true;
  /** Whether the survival block and the summary's survival line are shown (R-133). */
  readonly survival: boolean;
}

/**
 * Every rule-dependent line of /help, from the tournament's facts and the
 * standings' own counts (internal to the domain beside rulesPage).
 */
export function helpPage(facts: HelpFacts): HelpPage {
  return Object.freeze({
    tableLength: facts.teamCount,
    deadlineRound: facts.deadlineRound,
    standingsCloses: facts.standingsCloses,
    finalPlaces: STANDINGS_COUNTS.finalPlaces,
    partialTableAccepted: true,
    survival: facts.survival,
  });
}
