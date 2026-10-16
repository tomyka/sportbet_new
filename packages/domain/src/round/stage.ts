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

/**
 * R-10: the rate each Euroleague stage carries - play-in 1, play-offs 2,
 * Final Four (both semi-finals and the third-place game) 3, final 3. The
 * ruled set requires it (`RuleSet.stageRates`); the admin's round form
 * prefills it.
 */
export const STAGE_RATES: Readonly<Record<Stage, number>> = Object.freeze({
  regular: 1,
  'play-in': 1,
  'play-offs': 2,
  'final-four': 3,
  final: 3,
});

/**
 * The rates sportbet's /rules states ("×1 / ×2", written into its view): its
 * admin may set any rate, so there is no rule to read them from.
 */
const SPORTBET_STATED_RATES: readonly number[] = Object.freeze([1, 2]);

/**
 * The rates a rules page states: the distinct rates of the set's required
 * stage rates in stage order (R-10), or sportbet's two where the set fixes
 * none.
 */
export function statedRates(
  stageRates: Readonly<Record<Stage, number>> | null,
): readonly number[] {
  if (stageRates === null) return SPORTBET_STATED_RATES;
  return [...new Set(STAGES.map((stage) => stageRates[stage]))];
}
