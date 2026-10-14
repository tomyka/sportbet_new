import type { InviteCard, LeagueCard, LeaguesPage } from '@sportbet/domain';
import { leagueNo, player } from '@sportbet/domain/testing';

/** A plain member's card of a private league: nothing to do but switch (or not) and leave. */
export function leagueCard(overrides: Partial<LeagueCard> = {}): LeagueCard {
  return {
    id: leagueNo(7),
    name: 'Draugų lyga',
    description: null,
    baseFee: null,
    penaltyStep: null,
    memberCount: 3,
    selected: false,
    isOwner: false,
    isPublic: false,
    may: {
      switch: true,
      invite: false,
      edit: false,
      delete: false,
      leave: true,
    },
    people: null,
    ...overrides,
  };
}

/** The owner's card of a private league: invite, edit, delete and hand over, and the people they list. */
export function ownerCard(overrides: Partial<LeagueCard> = {}): LeagueCard {
  return leagueCard({
    isOwner: true,
    may: { switch: true, invite: true, edit: true, delete: true, leave: false },
    people: {
      members: [
        {
          player: player('1'),
          display: 'Jonas Jonaitis',
          username: 'jonas',
          isAdmin: true,
        },
        {
          player: player('2'),
          display: 'Petras Petraitis',
          username: 'petras',
          isAdmin: false,
        },
      ],
      pending: [{ display: 'Ona Onaitė', username: 'ona' }],
    },
    ...overrides,
  });
}

export function leaguesPageOf(
  mine: readonly LeagueCard[],
  invites: readonly InviteCard[] = [],
): LeaguesPage {
  return { mine, invites };
}

/**
 * Whether the page's own handlers let an event take its default action: the
 * event is fired, and what reaches the document is read and then stopped, so
 * jsdom does not try to navigate.
 */
export function letsThrough(
  type: 'submit' | 'click',
  fire: () => void,
): boolean {
  let prevented = true;
  const read = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener(type, read);
  fire();
  document.removeEventListener(type, read);
  return !prevented;
}
