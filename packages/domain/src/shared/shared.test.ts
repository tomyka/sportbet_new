import { describe, expect, it } from 'vitest';
import {
  gameId,
  idKey,
  playerId,
  roundNumber,
  roundNumberInvariant,
  teamId,
  tournamentId,
} from './ids';
import { instantFrom, secondsAfter } from './instant';
import { ok, refuse } from './result';

describe('Result', () => {
  it('carries an accepted value or a named refusal', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(refuse('level')).toEqual({ ok: false, refusal: 'level' });
  });
});

describe('ids', () => {
  it('accepts a team, a player, a game and a round', () => {
    expect(teamId('ZAL').ok).toBe(true);
    expect(playerId('ada').ok).toBe(true);
    expect(gameId(1).ok).toBe(true);
    expect(roundNumber(38).ok).toBe(true);
    expect(tournamentId('euroleague-2026-27').ok).toBe(true);
  });

  it.each([
    ['an empty team', teamId('')],
    ['an empty player', playerId('')],
    ['an empty tournament', tournamentId('')],
    ['a zero game id', gameId(0)],
    ['a fractional round', roundNumber(1.5)],
    ['a negative round', roundNumber(-1)],
  ])('refuses %s', (_, result) => {
    expect(result.ok).toBe(false);
  });
});

describe('idKey', () => {
  it('keeps tuples apart whatever their parts hold', () => {
    expect(idKey('a', 'bc')).not.toBe(idKey('ab', 'c'));
    expect(idKey('a:1', 'b')).not.toBe(idKey('a', '1:b'));
    expect(idKey('EL', 7)).toBe(idKey('EL', 7));
  });
});

describe('instantFrom', () => {
  it('reads a UTC timestamp to the second', () => {
    expect(instantFrom('2026-10-02T18:00:00Z')).toEqual(
      ok(Date.UTC(2026, 9, 2, 18, 0, 0)),
    );
  });

  it.each([
    ['a local time', '2026-10-02T18:00:00'],
    ['an offset', '2026-10-02T21:00:00+03:00'],
    ['a date only', '2026-10-02'],
    ['an impossible date', '2026-13-45T18:00:00Z'],
    // Date.parse does not refuse these: it rolls them into the next day or
    // month (2026-02-30 becomes March 2) instead of treating them as
    // invalid.
    ['a February 30th', '2026-02-30T18:00:00Z'],
    ['an April 31st', '2026-04-31T18:00:00Z'],
    ['a February 29th in a non-leap year', '2026-02-29T18:00:00Z'],
  ])('refuses %s', (_, iso) => {
    expect(instantFrom(iso)).toEqual(refuse('not-a-utc-timestamp'));
  });

  it('moves by whole seconds', () => {
    const tipOff = instantFrom('2026-10-02T18:00:00Z');
    expect(tipOff.ok && secondsAfter(tipOff.value, -1)).toBe(
      Date.UTC(2026, 9, 2, 17, 59, 59),
    );
  });
});

describe('roundNumber and its invariant', () => {
  it('accepts and refuses exactly as roundNumberInvariant does', () => {
    for (const { value } of roundNumberInvariant.accepts) {
      expect(roundNumber(value).ok).toBe(true);
    }
    for (const { value } of roundNumberInvariant.refuses) {
      expect(roundNumber(value)).toEqual(refuse('not-a-positive-integer'));
    }
  });
});
