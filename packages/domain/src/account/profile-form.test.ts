import { describe, expect, it } from 'vitest';
import { profileFormEntry, withHeld } from './profile-form';

const GOOD = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: 'ruta@example.lt',
};

const problemsOf = (posted: Record<string, unknown>) => {
  const { problems, entry } = profileFormEntry({ ...GOOD, ...posted });
  return entry === null ? problems : null;
};

describe('profileFormEntry', () => {
  it('takes four good answers and normalizes the address', () => {
    expect(profileFormEntry({ ...GOOD, email: 'User@X.com' })).toEqual({
      problems: {},
      username: GOOD.username,
      email: 'user@x.com',
      entry: { ...GOOD, email: 'user@x.com' },
    });
  });

  it('requires each field, a missing one as an empty one', () => {
    expect(
      profileFormEntry({
        username: '',
        name: undefined,
        surname: null,
        email: 3,
      }),
    ).toEqual({
      problems: {
        username: 'required',
        name: 'required',
        surname: 'required',
        email: 'required',
      },
      username: null,
      email: null,
      entry: null,
    });
  });

  it('refuses a username of characters the invariant refuses as blank', () => {
    expect(problemsOf({ username: ' ' })).toEqual({ username: 'blank' });
  });

  it('counts characters, not code units: 255 pass, 256 do not, an astral one is one', () => {
    const astral255 = '\u{1F600}'.repeat(255);
    expect(problemsOf({ name: astral255, surname: astral255 })).toBeNull();
    const over = 'ž'.repeat(256);
    expect(problemsOf({ username: over, name: over, surname: over })).toEqual({
      username: 'too-long',
      name: 'too-long',
      surname: 'too-long',
    });
    expect(problemsOf({ surname: 'ž'.repeat(255) })).toBeNull();
  });

  it('refuses a posted value that is no address, and one over 255', () => {
    expect(problemsOf({ email: 'not-an-address' })).toEqual({
      email: 'not-an-email',
    });
    expect(problemsOf({ email: `${'a'.repeat(245)}@example.lt` })).toEqual({
      email: 'too-long',
    });
    expect(problemsOf({ email: `${'a'.repeat(244)}@example.lt` })).toBeNull();
  });

  it('reports every refused field at once, and only those', () => {
    expect(problemsOf({ name: '', email: 'x' })).toEqual({
      name: 'required',
      email: 'not-an-email',
    });
  });
});

describe('what uniqueness is asked of', () => {
  it('names the username and the address that passed their own rules, whatever else failed', () => {
    const checked = profileFormEntry({ ...GOOD, name: '', email: 'x' });
    expect(checked.username).toBe(GOOD.username);
    expect(checked.email).toBeNull();
    expect(checked.entry).toBeNull();
    const blank = profileFormEntry({ ...GOOD, username: ' ' });
    expect(blank.username).toBeNull();
    expect(blank.email).toBe(GOOD.email);
  });
});

describe('withHeld', () => {
  it('adds taken to a field that passed and is held by another account', () => {
    expect(withHeld({}, { username: true, email: true })).toEqual({
      username: 'taken',
      email: 'taken',
    });
    expect(withHeld({}, { username: false, email: true })).toEqual({
      email: 'taken',
    });
    expect(withHeld({}, { username: true, email: false })).toEqual({
      username: 'taken',
    });
    expect(withHeld({}, { username: false, email: false })).toEqual({});
  });

  it('keeps a format refusal over taken, and the other fields as they were', () => {
    expect(
      withHeld(
        { username: 'too-long', name: 'required', email: 'not-an-email' },
        { username: true, email: true },
      ),
    ).toEqual({
      username: 'too-long',
      name: 'required',
      email: 'not-an-email',
    });
  });
});
