import { describe, expect, it } from 'vitest';
import { player, unwrap } from '../testing';
import { emailAddress } from './email';
import { googleId } from './google-id';
import {
  freeUsername,
  GOOGLE_USERNAME_SUFFIX_LIMIT,
  googleIdentity,
  googleNameParts,
  googleSignInPlan,
  googleUsernameBase,
  type GoogleIdentity,
} from './google-sign-in';

const SUB = unwrap(googleId('104520385693274017345'));
const ADDRESS = unwrap(emailAddress('jonas@example.lt'));

const identity = (over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
  sub: SUB,
  email: ADDRESS,
  emailVerified: true,
  name: 'Jonas Jonaitis',
  ...over,
});

describe('googleIdentity', () => {
  const claims = {
    sub: '104520385693274017345',
    email: 'Jonas@Example.LT',
    emailVerified: true,
    name: 'Jonas Jonaitis',
  };

  it('builds the identity, normalizing the address', () => {
    expect(googleIdentity(claims)).toEqual({
      ok: true,
      value: {
        sub: '104520385693274017345',
        email: 'jonas@example.lt',
        emailVerified: true,
        name: 'Jonas Jonaitis',
      },
    });
  });

  it('refuses a sub that is no GoogleId', () => {
    for (const sub of ['', 'a b', 'a'.repeat(256), 42, null, undefined]) {
      expect(googleIdentity({ ...claims, sub })).toEqual({
        ok: false,
        refusal: 'invalid',
      });
    }
  });

  it('is verified only for the boolean true', () => {
    for (const emailVerified of ['true', 1, 'yes', null, undefined, {}]) {
      const made = googleIdentity({ ...claims, emailVerified });
      expect(made.ok && made.value.emailVerified).toBe(false);
    }
    const made = googleIdentity({ ...claims, emailVerified: true });
    expect(made.ok && made.value.emailVerified).toBe(true);
  });

  it('makes an address that is no address once normalized, or no text, null', () => {
    for (const email of ['not-an-address', '', 'a b@x.lt', 5, undefined]) {
      const made = googleIdentity({ ...claims, email });
      expect(made.ok && made.value.email).toBeNull();
    }
  });

  it('makes a name that is no text null', () => {
    for (const name of [null, undefined, 7, {}]) {
      const made = googleIdentity({ ...claims, name });
      expect(made.ok && made.value.name).toBeNull();
    }
  });
});

// GoogleAuthController::handleGoogleCallback's order, row by row.
describe('googleSignInPlan', () => {
  const ADA = player('1');
  const BEN = player('2');
  const plan = (over: Partial<Parameters<typeof googleSignInPlan>[0]> = {}) =>
    googleSignInPlan({
      identity: identity(),
      bySub: null,
      byEmail: null,
      registrationOpen: true,
      ...over,
    });

  it('1. a sub already linked signs in', () => {
    expect(plan({ bySub: { player: ADA } })).toEqual({
      ok: true,
      value: { kind: 'sign-in', player: ADA },
    });
  });

  it('1. a linked sub signs in even when the address is unverified', () => {
    expect(
      plan({
        bySub: { player: ADA },
        identity: identity({ emailVerified: false }),
      }),
    ).toEqual({ ok: true, value: { kind: 'sign-in', player: ADA } });
  });

  it('1. a linked sub signs in with no address at all, and with registration closed', () => {
    expect(
      plan({
        bySub: { player: ADA },
        identity: identity({ email: null, emailVerified: false }),
        registrationOpen: false,
      }),
    ).toEqual({ ok: true, value: { kind: 'sign-in', player: ADA } });
  });

  it('1. the sub wins over an address that belongs to another account', () => {
    expect(plan({ bySub: { player: ADA }, byEmail: { player: BEN } })).toEqual({
      ok: true,
      value: { kind: 'sign-in', player: ADA },
    });
  });

  it('2. an unverified address is refused', () => {
    expect(plan({ identity: identity({ emailVerified: false }) })).toEqual({
      ok: false,
      refusal: 'unverified',
    });
  });

  it('2. no address at all is unverified', () => {
    expect(
      plan({ identity: identity({ email: null, emailVerified: true }) }),
    ).toEqual({ ok: false, refusal: 'unverified' });
  });

  it('2. unverified comes before the address match: nothing is linked on it', () => {
    expect(
      plan({
        identity: identity({ emailVerified: false }),
        byEmail: { player: BEN },
      }),
    ).toEqual({ ok: false, refusal: 'unverified' });
  });

  it('2. unverified comes before closed registration', () => {
    expect(
      plan({
        identity: identity({ emailVerified: false }),
        registrationOpen: false,
      }),
    ).toEqual({ ok: false, refusal: 'unverified' });
  });

  it('3. the account with exactly that address is linked', () => {
    expect(plan({ byEmail: { player: BEN } })).toEqual({
      ok: true,
      value: { kind: 'link', player: BEN },
    });
  });

  it('3. linking comes before closed registration', () => {
    expect(plan({ byEmail: { player: BEN }, registrationOpen: false })).toEqual(
      { ok: true, value: { kind: 'link', player: BEN } },
    );
  });

  it('4. with no account and registration closed, nothing is made (R-128, no message)', () => {
    expect(plan({ registrationOpen: false })).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
  });

  it('5. with no account and registration open, one is made', () => {
    expect(plan()).toEqual({ ok: true, value: { kind: 'register' } });
  });
});

describe('googleUsernameBase', () => {
  it('is the local part', () => {
    expect(googleUsernameBase('jonas@x.lt')).toBe('jonas');
  });

  it('is zaidejas for an empty local part', () => {
    expect(googleUsernameBase('@x.lt')).toBe('zaidejas');
  });

  it('cuts a 300-character local part so a suffix of 1000 still fits 255', () => {
    const base = googleUsernameBase(`${'a'.repeat(300)}@x.lt`);
    expect(Array.from(base)).toHaveLength(251);
    expect(
      Array.from(`${base}${String(GOOGLE_USERNAME_SUFFIX_LIMIT)}`),
    ).toHaveLength(255);
  });

  it('counts an astral character as one when it cuts', () => {
    const base = googleUsernameBase(`${'\u{1F600}'.repeat(300)}@x.lt`);
    expect(Array.from(base)).toHaveLength(251);
  });

  it('is zaidejas for a local part the username invariant refuses (only characters it treats as blank)', () => {
    expect(googleUsernameBase('　　@x.lt')).toBe('zaidejas');
  });
});

describe('googleNameParts', () => {
  it('has no name and no surname for none', () => {
    expect(googleNameParts(null)).toEqual(['', '']);
  });

  it('has a name alone for one word', () => {
    expect(googleNameParts('Jonas')).toEqual(['Jonas', '']);
  });

  it('splits two words on the space', () => {
    expect(googleNameParts('Jonas Jonaitis')).toEqual(['Jonas', 'Jonaitis']);
  });

  it('gives the rest to the surname for three words', () => {
    expect(googleNameParts('Jonas Petras Jonaitis')).toEqual([
      'Jonas',
      'Petras Jonaitis',
    ]);
  });

  it('trims surrounding spaces', () => {
    expect(googleNameParts('  Jonas Jonaitis  ')).toEqual([
      'Jonas',
      'Jonaitis',
    ]);
    expect(googleNameParts('   ')).toEqual(['', '']);
  });

  it('cuts each part to 255 characters, an astral character counting as one', () => {
    const [name, surname] = googleNameParts(
      `${'\u{1F600}'.repeat(300)} ${'b'.repeat(300)}`,
    );
    expect(Array.from(name)).toHaveLength(255);
    expect(surname).toBe('b'.repeat(255));
  });
});

describe('freeUsername', () => {
  const held =
    (...names: string[]) =>
    (candidate: string) =>
      names.includes(candidate);

  it('is the base when it is free', () => {
    expect(freeUsername('jonas', held())).toEqual({ ok: true, value: 'jonas' });
  });

  it('adds 2 when the base is held', () => {
    expect(freeUsername('jonas', held('jonas'))).toEqual({
      ok: true,
      value: 'jonas2',
    });
  });

  it('skips a held jonas2 for jonas3', () => {
    expect(freeUsername('jonas', held('jonas', 'jonas2'))).toEqual({
      ok: true,
      value: 'jonas3',
    });
  });

  it('tries the last suffix and then gives up', () => {
    const everyOneButLast = (candidate: string) =>
      candidate !== `jonas${String(GOOGLE_USERNAME_SUFFIX_LIMIT)}`;
    expect(freeUsername('jonas', everyOneButLast)).toEqual({
      ok: true,
      value: 'jonas1000',
    });
    expect(freeUsername('jonas', () => true)).toEqual({
      ok: false,
      refusal: 'exhausted',
    });
  });
});
