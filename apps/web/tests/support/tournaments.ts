// The tournaments the web tests store and render, defined once. Test data
// only: staging's seed keeps its own (packages/db/src/seed/staging.ts).

import type { NewTournament, Tournament } from '@sportbet/domain';

const EUROLEAGUE = {
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
} as const;

export const EUROLEAGUE_2025_26: NewTournament = {
  ...EUROLEAGUE,
  slug: 'euroleague-2025-26',
  name: 'Euroleague 2025/26',
};

export const EUROLEAGUE_2026_27: NewTournament = {
  ...EUROLEAGUE,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
};

/** A fixture as the database returns it, under `id`. */
export const storedAs = (
  id: number,
  tournament: NewTournament,
): Tournament => ({
  id,
  ...tournament,
});
