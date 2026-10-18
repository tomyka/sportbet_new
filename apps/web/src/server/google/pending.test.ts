import { instantFrom } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { GOOGLE_COOKIE, type CookieOptions } from '../cookies';
import { seal } from '../sealed';
import { clearPending, mintPending, readPending } from './pending';

const SECRET = 'google-pending-tests-only-not-a-secret-01';
const AT = unwrap(instantFrom('2026-10-18T10:00:00Z'));
const TRIP = { state: 'st', nonce: 'no', verifier: 've' };

/** A jar that records what is set and reads it back. */
function jar() {
  const values = new Map<string, string>();
  const sets: { name: string; value: string; options: CookieOptions }[] = [];
  return {
    sets,
    get: (name: string) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string, options: CookieOptions) => {
      values.set(name, value);
      sets.push({ name, value, options });
    },
  };
}

const later = (seconds: number) =>
  unwrap(
    instantFrom(
      new Date(AT + seconds * 1000).toISOString().replace('.000Z', 'Z'),
    ),
  );

describe('the sealed trip (purpose google-oauth)', () => {
  it('reads back what was minted, with its time, by its cookie name and flags', () => {
    const j = jar();
    mintPending(j, TRIP, SECRET, AT);
    expect(j.sets[0]?.name).toBe('__Host-sb_google');
    expect(j.sets[0]?.options).toEqual(GOOGLE_COOKIE.options);
    expect(readPending(j, SECRET, AT)).toEqual({ ...TRIP, at: AT });
  });

  it('is good for ten minutes and no longer', () => {
    const j = jar();
    mintPending(j, TRIP, SECRET, AT);
    expect(readPending(j, SECRET, later(600))).not.toBeNull();
    expect(readPending(j, SECRET, later(601))).toBeNull();
  });

  it('is nothing when missing', () => {
    expect(readPending(jar(), SECRET, AT)).toBeNull();
  });

  it('is nothing when sealed under another key', () => {
    const j = jar();
    mintPending(j, TRIP, `${SECRET}-other`, AT);
    expect(readPending(j, SECRET, AT)).toBeNull();
  });

  it("is nothing when it is another purpose's value, a flash included, put in its place", () => {
    for (const purpose of ['flash', 'sign-in', 'google-fixture-code']) {
      const j = jar();
      j.set(
        '__Host-sb_google',
        seal(purpose, { ...TRIP, at: '2026-10-18T10:00:00Z' }, SECRET),
        GOOGLE_COOKIE.options,
      );
      expect(readPending(j, SECRET, AT)).toBeNull();
    }
  });

  it.each([
    [{}],
    [{ ...TRIP, at: 'yesterday' }],
    [{ state: '', nonce: 'no', verifier: 've', at: '2026-10-18T10:00:00Z' }],
    [{ state: 'st', nonce: 'no', at: '2026-10-18T10:00:00Z' }],
    [{ ...TRIP, at: 5 }],
    ['text'],
    [null],
  ])('is nothing for a malformed payload %j', (payload) => {
    const j = jar();
    j.set(
      '__Host-sb_google',
      seal('google-oauth', payload, SECRET),
      GOOGLE_COOKIE.options,
    );
    expect(readPending(j, SECRET, AT)).toBeNull();
  });

  it('is nothing for a value that is not a sealed one at all', () => {
    const j = jar();
    j.set('__Host-sb_google', 'garbage', GOOGLE_COOKIE.options);
    expect(readPending(j, SECRET, AT)).toBeNull();
  });

  it('is cleared with its own flags and Max-Age 0', () => {
    const j = jar();
    clearPending(j);
    expect(j.sets).toEqual([
      {
        name: '__Host-sb_google',
        value: '',
        options: { ...GOOGLE_COOKIE.options, maxAge: 0 },
      },
    ]);
  });
});
