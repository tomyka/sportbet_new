import { describe, expect, it } from 'vitest';
import { playerId, tournamentId } from '../shared/ids';
import { instantFrom } from '../shared/instant';
import {
  cents,
  leagueId,
  storedLeague,
  storedLeagueInvite,
  storedLeagueMember,
  storedLeagueMessage,
  type League,
  type LeagueMember,
} from './league';

function must<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('expected an accepted result');
  return result.value;
}

const tournament = must(tournamentId('7'));
const ada = must(playerId('1'));
const bob = must(playerId('2'));
const id = must(leagueId(3));
const createdAt = must(instantFrom('2026-10-02T18:00:00Z'));

const privateLeague: League = {
  id,
  tournament,
  name: 'Draugų lyga',
  description: 'Kas pirmas',
  kind: { public: false, owner: ada },
  fee: { base: 10, penaltyStep: 2, reward: 'Pyragas' },
  payment: {
    beneficiary: 'Jonas Jonaitis',
    iban: 'LT121000011101001000',
    note: null,
  },
  createdAt,
};

const publicLeague: League = {
  ...privateLeague,
  name: 'Euroleague 2026/27',
  description: null,
  kind: { public: true },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: null,
};

const member: LeagueMember = {
  id: 5,
  league: id,
  player: ada,
  isAdmin: true,
  isGuest: false,
  paid: must(cents(1250)),
  joinedAt: createdAt,
};

describe('leagueId and cents', () => {
  it('take a positive whole number and a column-sized amount', () => {
    expect(leagueId(1).ok).toBe(true);
    expect(leagueId(0)).toEqual({
      ok: false,
      refusal: 'not-a-positive-integer',
    });
    expect(leagueId(2_147_483_648).ok).toBe(false);
    expect(cents(0).ok).toBe(true);
    expect(cents(100_000_000)).toEqual({ ok: false, refusal: 'not-cents' });
    expect(cents(1.5).ok).toBe(false);
  });
});

describe('storedLeague', () => {
  it('accepts sportbet-shaped rows: a private league and the public one', () => {
    expect(storedLeague(privateLeague)).toEqual({
      ok: true,
      value: privateLeague,
    });
    expect(storedLeague(publicLeague)).toEqual({
      ok: true,
      value: publicLeague,
    });
  });

  it('accepts a private league whose owner was deleted', () => {
    const orphan: League = {
      ...privateLeague,
      kind: { public: false, owner: null },
    };
    expect(storedLeague(orphan).ok).toBe(true);
  });

  it.each([
    ['name', { name: '' }],
    ['name', { name: 'Š'.repeat(256) }],
    ['base-fee', { fee: { ...privateLeague.fee, base: -1 } }],
    ['penalty-step', { fee: { ...privateLeague.fee, penaltyStep: -1 } }],
    [
      'beneficiary',
      { payment: { ...privateLeague.payment, beneficiary: 'Š'.repeat(71) } },
    ],
    ['iban', { payment: { ...privateLeague.payment, iban: 'L'.repeat(35) } }],
  ] as const)('refuses a broken %s', (refusal, change) => {
    expect(storedLeague({ ...privateLeague, ...change })).toEqual({
      ok: false,
      refusal,
    });
  });
});

describe('storedLeagueMember', () => {
  it('accepts a member, paid or not', () => {
    expect(storedLeagueMember(member)).toEqual({ ok: true, value: member });
    expect(
      storedLeagueMember({ ...member, paid: null, joinedAt: null }).ok,
    ).toBe(true);
  });

  it('refuses an id that is no database id', () => {
    expect(storedLeagueMember({ ...member, id: 0 })).toEqual({
      ok: false,
      refusal: 'id',
    });
  });
});

describe('storedLeagueInvite', () => {
  it('accepts an invite, with or without who sent it', () => {
    const invite = {
      id: 1,
      league: id,
      invitee: bob,
      invitedBy: ada,
      createdAt,
    };
    expect(storedLeagueInvite(invite)).toEqual({ ok: true, value: invite });
    expect(
      storedLeagueInvite({ ...invite, invitedBy: null, createdAt: null }).ok,
    ).toBe(true);
  });

  it('refuses an id that is no database id', () => {
    expect(
      storedLeagueInvite({
        id: -1,
        league: id,
        invitee: bob,
        invitedBy: null,
        createdAt: null,
      }),
    ).toEqual({ ok: false, refusal: 'id' });
  });
});

describe('storedLeagueMessage', () => {
  it('accepts a message of a league and a detached one', () => {
    const message = { id: 1, league: id, text: 'Sveiki', active: true };
    expect(storedLeagueMessage(message)).toEqual({ ok: true, value: message });
    expect(storedLeagueMessage({ ...message, league: null }).ok).toBe(true);
  });

  it('refuses an empty or too long text, and a bad id, by name', () => {
    const message = { id: 1, league: null, text: 'Sveiki', active: false };
    expect(storedLeagueMessage({ ...message, text: '' })).toEqual({
      ok: false,
      refusal: 'text',
    });
    expect(
      storedLeagueMessage({ ...message, text: 'Š'.repeat(10_001) }).ok,
    ).toBe(false);
    expect(storedLeagueMessage({ ...message, id: 0 })).toEqual({
      ok: false,
      refusal: 'id',
    });
  });
});
