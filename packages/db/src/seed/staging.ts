import type { Db } from '../client';
import { insertTournaments, type NewTournament } from '../tournament/queries';

/** Staging's fake data. Never real players or real tournaments' results. */
export const STAGING_TOURNAMENTS: readonly NewTournament[] = [
  { slug: 'euro-2028', name: 'Euro 2028', format: 'football' },
  {
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
  },
];

export async function seedStaging(db: Db): Promise<void> {
  await insertTournaments(db, STAGING_TOURNAMENTS);
}
