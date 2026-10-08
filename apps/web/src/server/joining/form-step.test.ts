import type { RegistrationForm } from '@sportbet/db';
import { describe, expect, it } from 'vitest';
import { EL_2026, PROFILE } from '../../../tests/support/hub-cards';
import type { Flash } from '../flash';
import { confirmRequiredOf, formOrElsewhere, signInFor } from './form-step';

// TournamentController::registerForm's and ::register's choices before
// anything is drawn or written.

const OPEN: Extract<RegistrationForm, { step: 'open' }> = {
  step: 'open',
  tournament: EL_2026,
  profile: PROFILE,
  games: 380,
  teams: 20,
  closesAt: null,
};

describe('formOrElsewhere', () => {
  it('a member is taken in (R-53, through enter)', () => {
    expect(formOrElsewhere({ step: 'member' }, 'el-2026')).toEqual({
      elsewhere: '/tournament/el-2026/enter',
    });
  });

  it('closed: through register/closed, which leaves the message', () => {
    expect(formOrElsewhere({ step: 'closed' }, 'el-2026')).toEqual({
      elsewhere: '/tournament/el-2026/register/closed',
    });
  });

  it('open: the form', () => {
    expect(formOrElsewhere(OPEN, 'el-2026')).toEqual({ form: OPEN });
  });
});

describe('confirmRequiredOf', () => {
  it("only the unconfirmed submit's message is the form's", () => {
    const unconfirmed: Flash = { kind: 'confirm-required' };
    expect(confirmRequiredOf(unconfirmed)).toBe(unconfirmed);
    expect(confirmRequiredOf({ kind: 'registration-closed' })).toBeNull();
    expect(confirmRequiredOf(null)).toBeNull();
  });
});

describe('signInFor', () => {
  it('a guest signs in and comes back to the form; with no readable slug, to sign-in alone', () => {
    expect(signInFor('el-2026')).toBe(
      `/login?intended=${encodeURIComponent('/tournament/el-2026/register')}`,
    );
    expect(signInFor(null)).toBe('/login');
  });
});
