import { describe, expect, it } from 'vitest';
import {
  gameId,
  gameIdFromText,
  idFromText,
  idKey,
  playerId,
  roundNumber,
  roundNumberInvariant,
  teamId,
  tournamentId,
} from './ids';
import { DAY_SECONDS, dayAfter, instantFrom, secondsAfter } from './instant';
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

  it.each(['1', '7', '2147483647'])(
    'an id typed into a URL or form: %s is one',
    (text) => {
      expect(idFromText(text)).toEqual({ ok: true, value: Number(text) });
      expect(gameIdFromText(text).ok).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['a leading zero', '007'],
    ['a sign', '+7'],
    ['a negative', '-7'],
    ['a fraction', '7.5'],
    ['an exponent', '1e2'],
    ['a space', ' 7'],
    ['letters', '7abc'],
    ['eleven digits', '12345678901'],
  ])('an id typed into a URL or form: %s is not one', (_, text) => {
    expect(idFromText(text)).toEqual({ ok: false, refusal: 'not-an-id' });
    expect(gameIdFromText(text).ok).toBe(false);
  });

  it('an id typed into a URL or form: ten digits past 2147483647 are out of range', () => {
    expect(idFromText('2147483648')).toEqual({
      ok: false,
      refusal: 'out-of-range',
    });
    expect(gameIdFromText('9999999999')).toEqual({
      ok: false,
      refusal: 'out-of-range',
    });
  });

  // games.id is a Postgres integer: an id past its maximum names no game,
  // and is refused here rather than failing the query.
  it('a game id is at most 2147483647, Postgres integer maximum', () => {
    expect(gameId(2_147_483_647).ok).toBe(true);
    expect(gameId(2_147_483_648)).toEqual({
      ok: false,
      refusal: 'not-a-positive-integer',
    });
    expect(gameId(9_999_999_999).ok).toBe(false);
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

it('a day is 86 400 seconds: UTC has no daylight saving', () => {
  expect(DAY_SECONDS).toBe(86_400);
});

describe('dayAfter', () => {
  it('is midnight UTC at the end of the day', () => {
    expect(dayAfter('2027-05-23')).toEqual(ok(Date.UTC(2027, 4, 24, 0, 0, 0)));
    expect(dayAfter('2026-12-31')).toEqual(ok(Date.UTC(2027, 0, 1, 0, 0, 0)));
  });

  it.each([
    ['an empty text', ''],
    ['a timestamp', '2027-05-23T00:00:00Z'],
    ['a February 30th', '2027-02-30'],
  ])('refuses %s', (_, date) => {
    expect(dayAfter(date)).toEqual(refuse('not-a-date'));
  });
});
