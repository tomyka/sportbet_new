import type { HubCard } from '@sportbet/db';
import type { Instant, Tournament, TournamentProfile } from '@sportbet/domain';
import { at } from '@sportbet/domain/testing';

// Hub cards for component tests: test data only.

export const EL_2026: Tournament = {
  id: 2,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

export const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: true,
};

export const TIP_OFF: Instant = at('2026-10-06T18:00:00Z');

/** A card with nothing but its header; `over` sets the rest. */
export function card(over: Partial<HubCard> = {}): HubCard {
  return {
    tournament: EL_2026,
    profile: PROFILE,
    group: 'active',
    action: null,
    howItWorks: false,
    upcomingGames: [],
    guestPanels: null,
    ...over,
  };
}
