import { describe, expect, it } from 'vitest';
import type { PlayerId } from '../shared/ids';
import { leagueNo, player, tournamentKey } from '../testing';
import {
  leaguesPage,
  type LeaguePerson,
  type LeagueRows,
  type PendingInvite,
} from './page';
import type { League, LeagueMember } from './league';

const ADA = player('1');
const BEN = player('2');
const CIA = player('3');

const person = (who: PlayerId, username: string): LeaguePerson => ({
  player: who,
  name: `Vardas${username}`,
  surname: `Pavardė${username}`,
  username,
});

const league = (
  id: number,
  name: string,
  owner: PlayerId | null | 'public',
): League => ({
  id: leagueNo(id),
  tournament: tournamentKey('7'),
  name,
  description: id === 1 ? null : `Aprašymas ${name}`,
  kind: owner === 'public' ? { public: true } : { public: false, owner },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: null,
});

const membership = (
  id: number,
  of: League,
  who: PlayerId,
  isAdmin: boolean,
): LeagueMember => ({
  id,
  league: of.id,
  player: who,
  isAdmin,
  isGuest: false,
  paid: null,
  joinedAt: null,
});

const rows = (
  of: League,
  viewer: PlayerId,
  over: Partial<LeagueRows> & { memberId?: number; admin?: boolean } = {},
): LeagueRows => {
  const { memberId = 1, admin = false, ...rest } = over;
  return {
    league: of,
    viewerMember: membership(memberId, of, viewer, admin),
    selected: false,
    memberCount: 3,
    members: [],
    pendingInvitees: [],
    ...rest,
  };
};

const PUBLIC = league(1, 'Euroleague', 'public');
const CLUB = league(2, 'Klubas', ADA);
const FRIENDS = league(3, 'Draugai', BEN);

describe('leaguesPage', () => {
  it("a plain member's card carries no member names", () => {
    const page = leaguesPage({
      leagues: [
        rows(FRIENDS, ADA, {
          members: [
            { ...person(BEN, 'ben'), isAdmin: true },
            { ...person(ADA, 'ada'), isAdmin: false },
          ],
          pendingInvitees: [person(CIA, 'cia')],
        }),
      ],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine[0]?.people).toBeNull();
    expect(page.mine[0]?.may).toMatchObject({ invite: false, edit: false });
  });

  it("an admin's card lists members and pending invitees", () => {
    const page = leaguesPage({
      leagues: [
        rows(CLUB, ADA, {
          admin: true,
          members: [
            { ...person(ADA, 'ada'), isAdmin: true },
            { ...person(BEN, 'ben'), isAdmin: false },
          ],
          pendingInvitees: [{ ...person(CIA, 'cia'), surname: '' }],
        }),
      ],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine[0]?.people).toEqual({
      members: [
        {
          player: ADA,
          display: 'Vardasada Pavardėada',
          username: 'ada',
          isAdmin: true,
        },
        {
          player: BEN,
          display: 'Vardasben Pavardėben',
          username: 'ben',
          isAdmin: false,
        },
      ],
      pending: [{ display: 'Vardascia', username: 'cia' }],
    });
    expect(page.mine[0]?.may).toMatchObject({ invite: true, edit: true });
  });

  it('draws a card from the league: name, description, count, selection, ownership', () => {
    const page = leaguesPage({
      leagues: [rows(CLUB, ADA, { admin: true, selected: true })],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine[0]).toMatchObject({
      id: CLUB.id,
      name: 'Klubas',
      description: 'Aprašymas Klubas',
      memberCount: 3,
      selected: true,
      isOwner: true,
      isPublic: false,
    });
  });

  it('carries the stored fees, null when none', () => {
    const fee = { ...CLUB, fee: { base: 10, penaltyStep: 2, reward: null } };
    const page = leaguesPage({
      leagues: [rows(fee, ADA), rows(FRIENDS, ADA, { memberId: 2 })],
      invites: [],
      viewer: ADA,
    });
    expect(
      page.mine.map(({ baseFee, penaltyStep }) => [baseFee, penaltyStep]),
    ).toEqual([
      [10, 2],
      [null, null],
    ]);
  });

  it('offers a switch only to a league that is not selected', () => {
    const page = leaguesPage({
      leagues: [
        rows(PUBLIC, ADA, { selected: true }),
        rows(CLUB, ADA, { memberId: 2 }),
      ],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine.map((card) => card.may.switch)).toEqual([false, true]);
  });

  it('leave is offered only for a private league the viewer does not own with two leagues', () => {
    const two = leaguesPage({
      leagues: [rows(PUBLIC, ADA), rows(FRIENDS, ADA, { memberId: 2 })],
      invites: [],
      viewer: ADA,
    });
    expect(two.mine.map((card) => card.may.leave)).toEqual([false, true]);
    const owned = leaguesPage({
      leagues: [rows(PUBLIC, ADA), rows(CLUB, ADA, { memberId: 2 })],
      invites: [],
      viewer: ADA,
    });
    expect(owned.mine.map((card) => card.may.leave)).toEqual([false, false]);
    const alone = leaguesPage({
      leagues: [rows(FRIENDS, ADA)],
      invites: [],
      viewer: ADA,
    });
    expect(alone.mine[0]?.may.leave).toBe(false);
  });

  it('delete is offered only to the owner of a private league', () => {
    const page = leaguesPage({
      leagues: [
        rows(CLUB, ADA, { admin: true }),
        rows(FRIENDS, ADA, { admin: true, memberId: 2 }),
        rows(PUBLIC, ADA, { admin: true, memberId: 3 }),
      ],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine.map((card) => card.may.delete)).toEqual([
      true,
      false,
      false,
    ]);
    expect(page.mine.map((card) => card.isOwner)).toEqual([true, false, false]);
  });

  it('leaguesPage offers Mokėjimai to an admin of a private league only', () => {
    const page = leaguesPage({
      leagues: [
        rows(CLUB, ADA, { admin: true }),
        rows(FRIENDS, ADA, { memberId: 2 }),
        rows(PUBLIC, ADA, { admin: true, memberId: 3 }),
      ],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine.map((card) => card.may.payments)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('a league whose owner is gone is owned by nobody', () => {
    const orphan = league(4, 'Našlaitė', null);
    const page = leaguesPage({
      leagues: [rows(orphan, ADA)],
      invites: [],
      viewer: ADA,
    });
    expect(page.mine[0]?.isOwner).toBe(false);
  });

  it('lists leagues by membership id and invites by invite id', () => {
    const invites: PendingInvite[] = [
      { id: 9, leagueName: 'B', inviterUsername: 'ben' },
      { id: 4, leagueName: 'A', inviterUsername: 'cia' },
    ];
    const page = leaguesPage({
      leagues: [
        rows(FRIENDS, ADA, { memberId: 8 }),
        rows(CLUB, ADA, { memberId: 3 }),
      ],
      invites,
      viewer: ADA,
    });
    expect(page.mine.map((card) => card.name)).toEqual(['Klubas', 'Draugai']);
    expect(page.invites.map((invite) => invite.id)).toEqual([4, 9]);
  });

  it('an invite from a deleted inviter shows -', () => {
    const page = leaguesPage({
      leagues: [],
      invites: [
        { id: 1, leagueName: 'Klubas', inviterUsername: null },
        { id: 2, leagueName: 'Kita', inviterUsername: 'ben' },
      ],
      viewer: ADA,
    });
    expect(page.invites).toEqual([
      { id: 1, leagueName: 'Klubas', invitedBy: '-' },
      { id: 2, leagueName: 'Kita', invitedBy: 'ben' },
    ]);
  });
});
