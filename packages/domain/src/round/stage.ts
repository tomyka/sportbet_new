/** The parts of a Euroleague season a round can belong to (R-10). */
export const STAGES = [
  'regular',
  'play-in',
  'play-offs',
  'final-four',
  'final',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * The last round of a Euroleague regular season: it is rounds 1 to 38
 * (R-10: survival ends after round 38; R-14: the final regular-season table
 * is entered after round 38). A later round is post-season.
 */
export const LAST_REGULAR_SEASON_ROUND = 38;
