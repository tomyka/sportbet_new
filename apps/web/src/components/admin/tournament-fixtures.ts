import type { AdminTournament } from '@sportbet/db';
import { roundNumber } from '@sportbet/domain';

const deadline = roundNumber(6);
if (!deadline.ok) throw new Error('fixtures: 6 is a round number');

/** Euroleague 2026/27 as /admin/tournaments lists it: running, with its end date unset. */
export const RUNNING: AdminTournament = {
  tournament: {
    id: 3,
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: null,
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  profile: {
    status: 'active',
    startsOn: '2026-10-01',
    sport: 'basketball',
    description: 'Sezonas',
    isPublic: true,
  },
};

/** A tournament an import left as finished, with its dates and a deadline round. */
export const FINISHED: AdminTournament = {
  tournament: {
    id: 2,
    slug: 'euroleague-2025-26',
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2026-05-31',
    standingsDeadlineRound: deadline.value,
    survival: false,
    standingsTableFinal: true,
  },
  profile: {
    status: 'finished',
    startsOn: '2025-10-01',
    sport: 'basketball',
    description: null,
    isPublic: false,
  },
};
