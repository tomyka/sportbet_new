import { describe, expect, it } from 'vitest';
import { leagueId } from '../league/league';
import { at, player, tournamentKey, unwrap } from '../testing';
import { sportbetColumns } from './sportbet-columns';
import type {
  SportbetLeagueMemberRow,
  SportbetLeagueRow,
} from './sportbet-rows';

const league: SportbetLeagueRow = {
  id: 7,
  tournament: tournamentKey('2'),
  name: 'Draugų lyga',
  description: null,
  is_public: 0,
  owner: player('1'),
  base_fee: 10,
  penalty_step: 2,
  reward_description: 'Pyragas',
  payment_beneficiary: 'Jonas Jonaitis',
  payment_iban: 'LT121000011101001000',
  payment_note: null,
  created_at: '2026-09-02 10:00:00',
};

const member: SportbetLeagueMemberRow = {
  id: 3,
  league: 7,
  player: player('1'),
  is_admin: 1,
  is_guest: 0,
  paid_amount: '12.50',
  created_at: '2026-09-03 10:00:00',
};

describe('sportbet columns: leagues', () => {
  it('maps a private league with its fee, payment details and creation time', () => {
    expect(unwrap(sportbetColumns.league(league))).toEqual({
      id: unwrap(leagueId(7)),
      tournament: tournamentKey('2'),
      name: 'Draugų lyga',
      description: null,
      kind: { public: false, owner: player('1') },
      fee: { base: 10, penaltyStep: 2, reward: 'Pyragas' },
      payment: {
        beneficiary: 'Jonas Jonaitis',
        iban: 'LT121000011101001000',
        note: null,
      },
      createdAt: at('2026-09-02T10:00:00Z'),
    });
  });

  it('maps the public league, and a private one whose owner is gone', () => {
    expect(
      unwrap(sportbetColumns.league({ ...league, is_public: 1, owner: null }))
        .kind,
    ).toEqual({ public: true });
    expect(
      unwrap(sportbetColumns.league({ ...league, owner: null })).kind,
    ).toEqual({ public: false, owner: null });
  });

  it('reads a timestamp that is none as none, never a refusal', () => {
    expect(
      unwrap(sportbetColumns.league({ ...league, created_at: null })).createdAt,
    ).toBeNull();
    expect(
      unwrap(
        sportbetColumns.league({
          ...league,
          created_at: '0000-00-00 00:00:00',
        }),
      ).createdAt,
    ).toBeNull();
  });

  it.each([
    ['bad-id', { id: 0 }],
    ['public-has-owner', { is_public: 1 }],
    ['name', { name: '' }],
    ['base-fee', { base_fee: -1 }],
    ['penalty-step', { penalty_step: -1 }],
    ['beneficiary', { payment_beneficiary: 'Š'.repeat(71) }],
    ['iban', { payment_iban: 'L'.repeat(35) }],
  ] as const)('refuses %s', (refusal, change) => {
    expect(sportbetColumns.league({ ...league, ...change })).toEqual({
      ok: false,
      refusal,
    });
  });
});

describe('sportbet columns: league_members', () => {
  it('maps the flags with != 0 and the amount paid to exact cents', () => {
    expect(unwrap(sportbetColumns.leagueMember(member))).toMatchObject({
      id: 3,
      isAdmin: true,
      isGuest: false,
      paid: 1250,
      joinedAt: at('2026-09-03T10:00:00Z'),
    });
    expect(
      unwrap(sportbetColumns.leagueMember({ ...member, is_guest: 1 })).isGuest,
    ).toBe(true);
    expect(
      unwrap(sportbetColumns.leagueMember({ ...member, paid_amount: null }))
        .paid,
    ).toBeNull();
    expect(
      unwrap(sportbetColumns.leagueMember({ ...member, paid_amount: '0.10' }))
        .paid,
    ).toBe(10);
  });

  it.each([
    ['bad-paid-amount', { paid_amount: '-1.00' }],
    ['bad-paid-amount', { paid_amount: '1000000.00' }],
    ['bad-paid-amount', { paid_amount: '1.234' }],
    ['bad-id', { id: 0 }],
    ['bad-id', { league: 0 }],
  ] as const)('refuses %s', (refusal, change) => {
    expect(sportbetColumns.leagueMember({ ...member, ...change })).toEqual({
      ok: false,
      refusal,
    });
  });
});

describe('sportbet columns: league_invites and messages', () => {
  it('maps an invite, with or without who sent it', () => {
    const row = {
      id: 1,
      league: 7,
      invitee: player('2'),
      invited_by: player('1'),
      created_at: '2026-09-04 10:00:00',
    };
    expect(unwrap(sportbetColumns.leagueInvite(row))).toMatchObject({
      id: 1,
      invitee: player('2'),
      invitedBy: player('1'),
    });
    expect(
      unwrap(sportbetColumns.leagueInvite({ ...row, invited_by: null }))
        .invitedBy,
    ).toBeNull();
    expect(sportbetColumns.leagueInvite({ ...row, league: 0 })).toEqual({
      ok: false,
      refusal: 'bad-id',
    });
  });

  it('maps a message of a league and a detached one, active with != 0', () => {
    const row = { id: 1, league: 7, message: 'Sveiki', active: 1 };
    expect(unwrap(sportbetColumns.message(row))).toEqual({
      id: 1,
      league: unwrap(leagueId(7)),
      text: 'Sveiki',
      active: true,
    });
    expect(
      unwrap(sportbetColumns.message({ ...row, league: null, active: 0 })),
    ).toMatchObject({ league: null, active: false });
    expect(sportbetColumns.message({ ...row, message: '' })).toEqual({
      ok: false,
      refusal: 'bad-text',
    });
    expect(sportbetColumns.message({ ...row, league: 0 })).toEqual({
      ok: false,
      refusal: 'bad-id',
    });
  });
});
