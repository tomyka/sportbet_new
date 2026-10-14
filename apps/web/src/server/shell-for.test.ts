import type { PlayerLeague } from '@sportbet/db';
import { leagueId, type Tournament } from '@sportbet/domain';
import { player, roundNo, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { guestView } from '../components/shell/shell-view';
import type { RequestContext } from './request-context';
import { shellPlayer, shellViewFor } from './shell-for';

const TOURNAMENT: Tournament = {
  id: 4,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

const JONAS = {
  id: player('1'),
  name: 'Jonas',
  surname: 'Petraitis',
  isAdmin: false,
  pendingInvites: 0,
};

/** A league of the player's, as loadPlayerLeagues lists it. */
function league(id: number, name: string, selected: boolean): PlayerLeague {
  return {
    id: unwrap(leagueId(id)),
    name,
    isPublic: id === 1,
    isGuest: false,
    selected,
  };
}

/** A request of the player in TOURNAMENT, with these leagues. */
function inTournament(
  leagues: readonly PlayerLeague[],
  contextPlayer: RequestContext['player'],
): RequestContext {
  return {
    player: contextPlayer,
    tournament: {
      tournament: TOURNAMENT,
      currentRound: roundNo(1),
      started: true,
      standingsLocked: false,
      nav: { survival: false, summary: false, survivalSummary: false },
      missingResults: 0,
      leagues,
    },
  };
}

describe('shellViewFor', () => {
  it('gives a guest the guest view', () => {
    expect(shellViewFor({ player: null, tournament: null }, false)).toEqual(
      guestView(),
    );
  });

  it('offers a guest the leaderboard once it has entries (issue 131), and never a player', () => {
    expect(
      shellViewFor({ player: null, tournament: null }, true).leaderboardOffered,
    ).toBe(true);
    expect(
      shellViewFor({ player: JONAS, tournament: null }, true)
        .leaderboardOffered,
    ).toBe(false);
  });

  it('gives a player their tournament and its flags, and with one league no league tab (issue 144)', () => {
    const context: RequestContext = {
      player: JONAS,
      tournament: {
        tournament: TOURNAMENT,
        currentRound: roundNo(1),
        started: true,
        standingsLocked: false,
        nav: { survival: true, summary: true, survivalSummary: true },
        missingResults: 0,
        leagues: [league(1, 'Euroleague 2026/27', true)],
      },
    };
    expect(shellViewFor(context, false)).toEqual({
      player: { name: 'Jonas P.', initials: 'JP', isAdmin: false },
      tournament: { name: 'Euroleague 2026/27', slug: 'euroleague-2026-27' },
      nav: { survival: true, summary: true, survivalSummary: true },
      badges: { results: 0, standings: 0, survival: 0, invites: 0 },
      leagues: { items: [{ id: 1, name: 'Euroleague 2026/27', active: true }] },
      leagueTab: false,
      leaderboardOffered: false,
    });
  });

  it("shows the Spėjimai badge with the current round's unanswered open games (MissingPredictions)", () => {
    const context: RequestContext = {
      player: JONAS,
      tournament: {
        tournament: TOURNAMENT,
        currentRound: roundNo(1),
        started: true,
        standingsLocked: false,
        nav: { survival: false, summary: true, survivalSummary: true },
        missingResults: 3,
        leagues: [],
      },
    };
    expect(shellViewFor(context, false).badges).toEqual({
      results: 3,
      standings: 0,
      survival: 0,
      invites: 0,
    });
  });

  it("lists the player's leagues in order with the selected one active, and from two leagues offers the league tab (issue 144)", () => {
    const view = shellViewFor(
      inTournament(
        [
          league(1, 'Euroleague 2026/27', false),
          league(7, 'Draugų lyga', true),
        ],
        JONAS,
      ),
      false,
    );
    expect(view.leagues).toEqual({
      items: [
        { id: 1, name: 'Euroleague 2026/27', active: false },
        { id: 7, name: 'Draugų lyga', active: true },
      ],
    });
    expect(view.leagueTab).toBe(true);
  });

  it('counts the pending league invites on the invites badge, whatever the tournament (issue 183)', () => {
    const view = shellViewFor(
      inTournament([league(1, 'Euroleague 2026/27', true)], {
        ...JONAS,
        pendingInvites: 2,
      }),
      false,
    );
    expect(view.badges.invites).toBe(2);
    expect(
      shellViewFor(
        { player: { ...JONAS, pendingInvites: 3 }, tournament: null },
        false,
      ).badges.invites,
    ).toBe(3);
  });

  it('draws no league row for a player in no tournament', () => {
    const view = shellViewFor({ player: JONAS, tournament: null }, false);
    expect(view.leagues).toBeNull();
    expect(view.leagueTab).toBe(false);
  });

  it('gives a player in no tournament every flag off', () => {
    expect(
      shellViewFor({ player: JONAS, tournament: null }, false).nav,
    ).toEqual({
      survival: false,
      summary: false,
      survivalSummary: false,
    });
  });
});

// sportbet's partials/rail-account: "{name} {surname's first letter}." and
// the two initials.
describe('shellPlayer', () => {
  it('shows the name and the first letter of the surname, and never the surname itself', () => {
    expect(shellPlayer(JONAS)).toEqual({
      name: 'Jonas P.',
      initials: 'JP',
      isAdmin: false,
    });
  });

  it('takes a Lithuanian first letter whole, where sportbet took its first byte', () => {
    expect(
      shellPlayer({ name: 'žilvinas', surname: 'Šimkus', isAdmin: true }),
    ).toEqual({ name: 'žilvinas Š.', initials: 'ŽŠ', isAdmin: true });
  });

  it('shows the name alone when there is no surname, as a Google sign-up leaves it', () => {
    expect(shellPlayer({ name: 'Jonas', surname: '', isAdmin: false })).toEqual(
      {
        name: 'Jonas',
        initials: 'J',
        isAdmin: false,
      },
    );
  });
});
