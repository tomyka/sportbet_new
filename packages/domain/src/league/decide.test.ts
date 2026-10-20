import { describe, expect, it } from 'vitest';
import type { PlayerId } from '../shared/ids';
import { leagueNo, player, tournamentKey } from '../testing';
import {
  acceptInvite,
  createLeague,
  declineInvite,
  deleteLeague,
  inviteToLeague,
  leaveLeague,
  superadminDeleteLeague,
  superadminLeagueEdit,
  transferLeague,
  updateLeague,
} from './decide';
import type { LeagueEntry } from './form';
import type { League, LeagueInvite, LeagueMember } from './league';

const ADA = player('1');
const BEN = player('2');
const CIA = player('3');

const entry: LeagueEntry = {
  name: 'Klubas',
  description: 'Kas pirmas',
  baseFee: 10,
  penaltyStep: 2,
  reward: 'Pyragas',
};

const tournament = {
  id: 7,
  slug: 'euroleague',
  name: 'Euroleague',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
} as const;

const LEAGUE = leagueNo(41);

const privateLeague = (owner: PlayerId | null = ADA): League => ({
  id: LEAGUE,
  tournament: tournamentKey('7'),
  name: 'Klubas',
  description: null,
  kind: { public: false, owner },
  fee: { base: 5, penaltyStep: 1, reward: 'Pyragas' },
  payment: { beneficiary: 'Jonas', iban: 'LT121000011101001000', note: null },
  createdAt: null,
});

const publicLeague: League = {
  ...privateLeague(),
  kind: { public: true },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
};

const member = (
  who: PlayerId,
  over: Partial<LeagueMember> = {},
): LeagueMember => ({
  id: 1,
  league: LEAGUE,
  player: who,
  isAdmin: false,
  isGuest: false,
  paid: null,
  joinedAt: null,
  ...over,
});

const invite = (invitee: PlayerId): LeagueInvite => ({
  id: 9,
  league: LEAGUE,
  invitee,
  invitedBy: ADA,
  createdAt: null,
});

describe('createLeague', () => {
  it('makes the player owner and admin of a private league in the tournament (R-105)', () => {
    expect(
      createLeague({ entry, player: ADA, tournament, isPlayerIn: true }),
    ).toEqual({
      ok: true,
      value: {
        tournament: 7,
        owner: ADA,
        name: 'Klubas',
        description: 'Kas pirmas',
        baseFee: 10,
        penaltyStep: 2,
        reward: 'Pyragas',
        membership: { isAdmin: true, isGuest: false },
      },
    });
  });

  it('refuses with no tournament (issue 272)', () => {
    expect(
      createLeague({ entry, player: ADA, tournament: null, isPlayerIn: false }),
    ).toEqual({ ok: false, refusal: 'no-tournament' });
  });

  it('refuses a player who is not registered for the tournament', () => {
    expect(
      createLeague({ entry, player: ADA, tournament, isPlayerIn: false }),
    ).toEqual({ ok: false, refusal: 'no-tournament' });
  });
});

describe('updateLeague', () => {
  const admin = member(ADA, { isAdmin: true });

  it('lets an admin change the name, description and fees', () => {
    expect(
      updateLeague({
        league: privateLeague(),
        actorMember: admin,
        entry: { ...entry, name: 'Naujas' },
      }),
    ).toEqual({
      ok: true,
      value: {
        name: 'Naujas',
        description: 'Kas pirmas',
        baseFee: 10,
        penaltyStep: 2,
      },
    });
  });

  it('refuses a member who is not an admin', () => {
    expect(
      updateLeague({
        league: privateLeague(),
        actorMember: member(BEN),
        entry,
      }),
    ).toEqual({ ok: false, refusal: 'not-an-admin' });
  });

  it('refuses no membership', () => {
    expect(
      updateLeague({ league: privateLeague(), actorMember: null, entry }),
    ).toEqual({ ok: false, refusal: 'not-an-admin' });
  });

  it('lets an admin who is not the owner edit (R-105: former owners)', () => {
    expect(
      updateLeague({
        league: privateLeague(BEN),
        actorMember: admin,
        entry,
      }).ok,
    ).toBe(true);
  });

  it('leaves the reward and the payment details untouched', () => {
    const edit = updateLeague({
      league: privateLeague(),
      actorMember: admin,
      entry,
    });
    expect(edit.ok && Object.keys(edit.value).sort()).toEqual([
      'baseFee',
      'description',
      'name',
      'penaltyStep',
    ]);
  });
});

describe('inviteToLeague', () => {
  const open = {
    league: privateLeague(),
    actorMember: member(ADA, { isAdmin: true }),
    invitee: BEN,
    inviteeIsMember: false,
    inviteeHasInvite: false,
    inviteeInTournament: true,
  };

  it('writes an invite from the actor to a tournament player', () => {
    expect(inviteToLeague(open)).toEqual({
      ok: true,
      value: { league: LEAGUE, invitee: BEN, invitedBy: ADA },
    });
  });

  it('refuses a non-admin before anything else', () => {
    expect(
      inviteToLeague({
        ...open,
        actorMember: member(ADA),
        inviteeIsMember: true,
        inviteeInTournament: false,
      }),
    ).toEqual({ ok: false, refusal: 'not-an-admin' });
    expect(inviteToLeague({ ...open, actorMember: null })).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
  });

  it('refuses a member', () => {
    expect(inviteToLeague({ ...open, inviteeIsMember: true })).toEqual({
      ok: false,
      refusal: 'already-member-or-invited',
    });
  });

  it('refuses a pending invitee', () => {
    expect(inviteToLeague({ ...open, inviteeHasInvite: true })).toEqual({
      ok: false,
      refusal: 'already-member-or-invited',
    });
  });

  it('refuses an invite to oneself as already a member', () => {
    expect(inviteToLeague({ ...open, invitee: ADA })).toEqual({
      ok: false,
      refusal: 'already-member-or-invited',
    });
  });

  it('refuses a player outside the tournament (R-20)', () => {
    expect(inviteToLeague({ ...open, inviteeInTournament: false })).toEqual({
      ok: false,
      refusal: 'not-in-tournament',
    });
  });

  it('checks already-member before R-20', () => {
    expect(
      inviteToLeague({
        ...open,
        inviteeIsMember: true,
        inviteeInTournament: false,
      }),
    ).toEqual({ ok: false, refusal: 'already-member-or-invited' });
  });
});

describe('acceptInvite', () => {
  it('makes a plain member of the invitee', () => {
    expect(
      acceptInvite({ invite: invite(BEN), actor: BEN, inTournament: true }),
    ).toEqual({
      ok: true,
      value: {
        league: LEAGUE,
        player: BEN,
        membership: { isAdmin: false, isGuest: false },
      },
    });
  });

  it("refuses another player's invite", () => {
    expect(
      acceptInvite({ invite: invite(BEN), actor: CIA, inTournament: true }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
  });

  it('refuses a missing invite as not yours', () => {
    expect(
      acceptInvite({ invite: null, actor: BEN, inTournament: true }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
  });

  it('refuses outside the tournament and says so (R-20); the invite stays', () => {
    expect(
      acceptInvite({ invite: invite(BEN), actor: BEN, inTournament: false }),
    ).toEqual({ ok: false, refusal: 'not-in-tournament' });
  });

  it("refuses another player's invite before R-20", () => {
    expect(
      acceptInvite({ invite: invite(BEN), actor: CIA, inTournament: false }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
  });
});

describe('declineInvite', () => {
  it('accepts the invitee', () => {
    expect(declineInvite({ invite: invite(BEN), actor: BEN })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("refuses another player's invite", () => {
    expect(declineInvite({ invite: invite(BEN), actor: CIA })).toEqual({
      ok: false,
      refusal: 'not-your-invite',
    });
  });

  it('refuses a missing invite', () => {
    expect(declineInvite({ invite: null, actor: BEN })).toEqual({
      ok: false,
      refusal: 'not-your-invite',
    });
  });
});

describe('leaveLeague', () => {
  const may = {
    league: privateLeague(),
    actor: BEN,
    member: member(BEN),
    otherLeaguesInTournament: 1,
    selectsIt: false,
  };

  it('lets a member leave a private league they do not own', () => {
    expect(leaveLeague(may)).toEqual({
      ok: true,
      value: { selectPublic: false },
    });
  });

  it('refuses the public league', () => {
    expect(leaveLeague({ ...may, league: publicLeague })).toEqual({
      ok: false,
      refusal: 'public',
    });
  });

  it('refuses the owner', () => {
    expect(leaveLeague({ ...may, league: privateLeague(BEN) })).toEqual({
      ok: false,
      refusal: 'owner',
    });
  });

  it('lets a league whose owner is gone be left', () => {
    expect(leaveLeague({ ...may, league: privateLeague(null) }).ok).toBe(true);
  });

  it('refuses the only league', () => {
    expect(
      leaveLeague({
        ...may,
        otherLeaguesInTournament: 0,
      }),
    ).toEqual({ ok: false, refusal: 'only-league' });
  });

  it('refuses a non-member', () => {
    expect(leaveLeague({ ...may, member: null })).toEqual({
      ok: false,
      refusal: 'not-a-member',
    });
  });

  it('checks public, owner and only-league before membership', () => {
    const stranger = { ...may, member: null };
    expect(leaveLeague({ ...stranger, league: publicLeague })).toMatchObject({
      refusal: 'public',
    });
    expect(
      leaveLeague({ ...stranger, league: privateLeague(BEN) }),
    ).toMatchObject({ refusal: 'owner' });
    expect(
      leaveLeague({
        ...stranger,
        otherLeaguesInTournament: 0,
      }),
    ).toMatchObject({ refusal: 'only-league' });
  });

  it('asks to select the public league when it was selected', () => {
    expect(leaveLeague({ ...may, selectsIt: true })).toEqual({
      ok: true,
      value: { selectPublic: true },
    });
  });
});

describe('leaveLeague R-29', () => {
  const elsewhereOnly = {
    league: privateLeague(),
    actor: BEN,
    member: member(BEN),
    otherLeaguesInTournament: 0,
    selectsIt: false,
  };

  it('does not count a league elsewhere', () => {
    expect(leaveLeague({ ...elsewhereOnly })).toEqual({
      ok: false,
      refusal: 'only-league',
    });
  });

  it('counts this tournament', () => {
    expect(
      leaveLeague({ ...elsewhereOnly, otherLeaguesInTournament: 1 }).ok,
    ).toBe(true);
  });
});

describe('deleteLeague', () => {
  it('lets the owner delete and names every selecting player to move', () => {
    expect(
      deleteLeague({
        league: privateLeague(),
        actor: ADA,
        selectingPlayers: [ADA, BEN],
      }),
    ).toEqual({ ok: true, value: { moveToPublic: [ADA, BEN] } });
  });

  it('refuses a non-owner', () => {
    expect(
      deleteLeague({
        league: privateLeague(),
        actor: BEN,
        selectingPlayers: [],
      }),
    ).toEqual({ ok: false, refusal: 'not-owner' });
  });

  it('refuses the public league as not owned, as sportbet answers 403 first', () => {
    expect(
      deleteLeague({ league: publicLeague, actor: ADA, selectingPlayers: [] }),
    ).toEqual({ ok: false, refusal: 'not-owner' });
  });

  it('refuses a league whose owner is gone', () => {
    expect(
      deleteLeague({
        league: privateLeague(null),
        actor: ADA,
        selectingPlayers: [],
      }),
    ).toEqual({ ok: false, refusal: 'not-owner' });
  });
});

describe('transferLeague', () => {
  it('R-23 hands to a member, who becomes owner and admin; the old owner is untouched', () => {
    expect(
      transferLeague({
        league: privateLeague(),
        actor: ADA,
        to: member(BEN),
      }),
    ).toEqual({ ok: true, value: { owner: BEN, admin: BEN } });
  });

  it('refuses a non-owner', () => {
    expect(
      transferLeague({
        league: privateLeague(),
        actor: BEN,
        to: member(CIA),
      }),
    ).toEqual({ ok: false, refusal: 'not-owner' });
  });

  it('refuses a player who is not a member', () => {
    expect(
      transferLeague({ league: privateLeague(), actor: ADA, to: null }),
    ).toEqual({ ok: false, refusal: 'not-a-member' });
  });

  it('refuses the owner themselves', () => {
    expect(
      transferLeague({
        league: privateLeague(),
        actor: ADA,
        to: member(ADA),
      }),
    ).toEqual({ ok: false, refusal: 'already-owner' });
  });

  it('refuses the public league first', () => {
    expect(
      transferLeague({ league: publicLeague, actor: ADA, to: member(BEN) }),
    ).toEqual({ ok: false, refusal: 'public' });
  });

  it('checks owner before membership', () => {
    expect(
      transferLeague({ league: privateLeague(), actor: BEN, to: null }),
    ).toEqual({ ok: false, refusal: 'not-owner' });
  });
});

describe('superadminLeagueEdit (sportbet #128: the owner form, for a superadmin)', () => {
  it('changes exactly what an owner may: the name, description and fees, never the reward', () => {
    expect(superadminLeagueEdit(entry)).toEqual({
      name: 'Klubas',
      description: 'Kas pirmas',
      baseFee: 10,
      penaltyStep: 2,
    });
  });

  it('is the same edit an admin member gets', () => {
    const asAdmin = updateLeague({
      league: privateLeague(),
      actorMember: member(ADA, { isAdmin: true }),
      entry,
    });
    expect(asAdmin).toEqual({ ok: true, value: superadminLeagueEdit(entry) });
  });
});

describe('superadminDeleteLeague (R-118)', () => {
  it('lets a superadmin end a private league whoever owns it, moving the selecting players', () => {
    expect(
      superadminDeleteLeague({
        league: privateLeague(CIA),
        selectingPlayers: [ADA, BEN],
      }),
    ).toEqual({ ok: true, value: { moveToPublic: [ADA, BEN] } });
    expect(
      superadminDeleteLeague({
        league: privateLeague(null),
        selectingPlayers: [],
      }),
    ).toEqual({ ok: true, value: { moveToPublic: [] } });
  });

  it('refuses the public league (sportbet: "Viešos lygos ištrinti negalima")', () => {
    expect(
      superadminDeleteLeague({ league: publicLeague, selectingPlayers: [] }),
    ).toEqual({ ok: false, refusal: 'public' });
  });
});
