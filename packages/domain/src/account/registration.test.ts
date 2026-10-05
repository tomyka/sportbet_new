import { describe, expect, expectTypeOf, it } from 'vitest';
import { usernameInvariant } from '../player/player';
import { ANSWER_MAX_LENGTH, personNameInvariant } from './person-name';
import {
  registrationAnswers,
  registrationProblems,
  type RegistrationProblems,
} from './registration';

const TYPED = {
  username: 'naujoke',
  name: 'Rūta',
  surname: '',
  email: 'Ruta.Naujoke@Example.LT',
};

/** 255 characters, and one more: sportbet's max:255 counts characters (mb_strlen). */
const AT_MOST = 'ž'.repeat(255);
const OVER = 'ž'.repeat(256);
const ADDRESS_AT_MOST = `${'a'.repeat(244)}@example.lt`;
const ADDRESS_OVER = `${'a'.repeat(245)}@example.lt`;

// sportbet's RegisteredUserController::store rules, with the owner's
// answers (2026-10-05): an address with capitals is lowered, not refused.
describe('registration answers', () => {
  it('registration: takes a username, a name, no surname and an address, lowering the address (the owner, 2026-10-05)', () => {
    expect(registrationProblems(TYPED)).toEqual({});
    expect(registrationAnswers(TYPED)).toEqual({
      ok: true,
      value: {
        username: 'naujoke',
        name: 'Rūta',
        surname: '',
        email: 'ruta.naujoke@example.lt',
      },
    });
  });

  it('registration: a username, a name and an address are required; a surname is not', () => {
    const blank = { username: '', name: '', surname: '', email: '' };
    expect(registrationProblems(blank)).toEqual({
      username: 'required',
      name: 'required',
      email: 'required',
    });
    expect(registrationAnswers(blank)).toEqual({
      ok: false,
      refusal: 'answers-refused',
    });
  });

  it('registration: an address that is not one is refused before its length is', () => {
    expect(registrationProblems({ ...TYPED, email: 'ruta.naujoke' })).toEqual({
      email: 'not-an-email',
    });
    expect(registrationProblems({ ...TYPED, email: 'x'.repeat(300) })).toEqual({
      email: 'not-an-email',
    });
  });

  it('registration: every answer is at most 255 characters, counted as characters', () => {
    expect(
      registrationProblems({
        username: AT_MOST,
        name: AT_MOST,
        surname: AT_MOST,
        email: ADDRESS_AT_MOST,
      }),
    ).toEqual({});
    expect(
      registrationProblems({
        username: OVER,
        name: OVER,
        surname: OVER,
        email: ADDRESS_OVER,
      }),
    ).toEqual({
      username: 'too-long',
      name: 'too-long',
      surname: 'too-long',
      email: 'too-long',
    });
  });

  it('registration: one limit, 255, for every answer and the stored username, name and surname (max:255)', () => {
    expect(ANSWER_MAX_LENGTH).toBe(255);
    expect(usernameInvariant.maxLength).toBe(ANSWER_MAX_LENGTH);
    expect(personNameInvariant.maxLength).toBe(ANSWER_MAX_LENGTH);
  });

  it('registration: a username of only a space JavaScript knows and Laravel does not trim is blank, not missing (plan decision 14)', () => {
    expect(registrationProblems({ ...TYPED, username: '\u2028' })).toEqual({
      username: 'blank',
    });
  });

  it('registration: each field fails only the rules it has - a surname is never required, only a username is blank', () => {
    expectTypeOf<RegistrationProblems['username']>().toEqualTypeOf<
      'required' | 'blank' | 'too-long' | undefined
    >();
    expectTypeOf<RegistrationProblems['name']>().toEqualTypeOf<
      'required' | 'too-long' | undefined
    >();
    expectTypeOf<RegistrationProblems['surname']>().toEqualTypeOf<
      'too-long' | undefined
    >();
    expectTypeOf<RegistrationProblems['email']>().toEqualTypeOf<
      'required' | 'not-an-email' | 'too-long' | undefined
    >();
  });
});
