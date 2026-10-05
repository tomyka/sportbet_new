import { describe, expect, it } from 'vitest';
import { guestView, isPlayerView, showsLeagueTab } from './shell-view';

const league = (id: number, active = false) => ({
  id,
  name: `Lyga ${String(id)}`,
  active,
});

it('tells the shell a guest has no player, tournament, flags, badges or leagues', () => {
  expect(guestView()).toEqual({
    player: null,
    tournament: null,
    nav: { survival: false, summary: false, survivalSummary: false },
    badges: { results: 0, standings: 0, survival: 0, invites: 0 },
    leagues: null,
    leagueTab: false,
  });
});

describe('showsLeagueTab', () => {
  // sportbet's partials/bottom-nav: the drop-up only with more than one
  // league (issue 144: with one there is nothing to switch to).
  it('is off without leagues, and with one', () => {
    expect(showsLeagueTab(null)).toBe(false);
    expect(showsLeagueTab({ items: [] })).toBe(false);
    expect(showsLeagueTab({ items: [league(1, true)] })).toBe(false);
  });

  it('is on from two leagues, whichever is active', () => {
    expect(showsLeagueTab({ items: [league(1, true), league(2)] })).toBe(true);
    expect(showsLeagueTab({ items: [league(1), league(2)] })).toBe(true);
  });
});

describe('isPlayerView', () => {
  it('tells a signed-in view from a guest one', () => {
    expect(isPlayerView(guestView())).toBe(false);
    expect(
      isPlayerView({
        ...guestView(),
        player: { name: 'Jonas P.', initials: 'JP', isAdmin: false },
      }),
    ).toBe(true);
  });
});
