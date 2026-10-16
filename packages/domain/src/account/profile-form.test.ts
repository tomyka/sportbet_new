import { describe, expect, it } from 'vitest';
import { profileFormEntry } from './profile-form';

const GOOD = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: 'ruta@example.lt',
};

const problemsOf = (posted: Record<string, unknown>) => {
  const checked = profileFormEntry({ ...GOOD, ...posted });
  return checked.ok ? null : checked.problems;
};

describe('profileFormEntry', () => {
  it('takes four good answers and normalizes the address', () => {
    expect(profileFormEntry({ ...GOOD, email: 'User@X.com' })).toEqual({
      ok: true,
      value: { ...GOOD, email: 'user@x.com' },
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
      ok: false,
      problems: {
        username: 'required',
        name: 'required',
        surname: 'required',
        email: 'required',
      },
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
