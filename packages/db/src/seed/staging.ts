import type { Db } from '../client';
import { insertTournaments, type NewTournament } from '../tournament/queries';

/** Staging's fake data. Never real players or real tournaments' results. */
export const STAGING_TOURNAMENTS: readonly NewTournament[] = [
  {
    slug: 'euroleague-2025-26',
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2026-05-24',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  {
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
];

export async function seedStaging(db: Db): Promise<void> {
  await insertTournaments(db, STAGING_TOURNAMENTS);
}
