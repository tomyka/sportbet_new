/** The parts of a Euroleague season a round can belong to (R-10). */
export const STAGES = [
  'regular',
  'play-in',
  'play-offs',
  'final-four',
  'final',
] as const;

export type Stage = (typeof STAGES)[number];
