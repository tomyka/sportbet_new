import type { Tournament } from '@sportbet/domain';
import { player, roundNo } from '@sportbet/domain/testing';
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
};

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

  it("gives a player their tournament and its flags, no leagues (slice 12) and so no league tab (#16's comment)", () => {
    const context: RequestContext = {
      player: JONAS,
      tournament: {
        tournament: TOURNAMENT,
        currentRound: roundNo(1),
        started: true,
        standingsLocked: false,
        nav: { survival: true, summary: true, survivalSummary: true },
        missingResults: 0,
      },
    };
    expect(shellViewFor(context, false)).toEqual({
      player: { name: 'Jonas P.', initials: 'JP', isAdmin: false },
      tournament: { name: 'Euroleague 2026/27', slug: 'euroleague-2026-27' },
      nav: { survival: true, summary: true, survivalSummary: true },
      badges: { results: 0, standings: 0, survival: 0, invites: 0 },
      leagues: null,
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
      },
    };
    expect(shellViewFor(context, false).badges).toEqual({
      results: 3,
      standings: 0,
      survival: 0,
      invites: 0,
    });
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
