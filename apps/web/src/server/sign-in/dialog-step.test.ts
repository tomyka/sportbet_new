import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { dialogStep, dialogTabOf } from './dialog-step';

const EMAIL = unwrap(emailAddress('ruta.naujoke@example.lt'));
const NOW = at('2026-10-05T12:01:00Z');
const login = (sentAt: string) => ({ email: EMAIL, sentAt: at(sentAt) });
const registration = (sentAt: string) => ({
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: EMAIL,
  tournament: null,
  sentAt: at(sentAt),
});

// AuthDialogComposer and AuthCodeStep (issue 108).
describe('the step the dialog draws', () => {
  it('the forms when nothing is pending', () => {
    expect(dialogStep(null, null, NOW)).toEqual({ kind: 'email' });
  });

  it('a pending registration: its code step, with the answers its resend posts again (issue 114)', () => {
    expect(dialogStep(null, registration('2026-10-05T12:00:00Z'), NOW)).toEqual(
      {
        kind: 'register-code',
        email: 'ruta.naujoke@example.lt',
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        sentAt: '2026-10-05T12:00:00Z',
        resendIn: 0,
        expiresIn: 240,
      },
    );
  });

  it('both pending: the one asked for last, a tie to the registration', () => {
    expect(
      dialogStep(
        login('2026-10-05T12:00:30Z'),
        registration('2026-10-05T12:00:00Z'),
        NOW,
      ).kind,
    ).toBe('code');
    expect(
      dialogStep(
        login('2026-10-05T12:00:00Z'),
        registration('2026-10-05T12:00:30Z'),
        NOW,
      ).kind,
    ).toBe('register-code');
    expect(
      dialogStep(
        login('2026-10-05T12:00:00Z'),
        registration('2026-10-05T12:00:00Z'),
        NOW,
      ).kind,
    ).toBe('register-code');
  });

  it('drops a step whose code has died: a dead countdown never opens over a page', () => {
    expect(
      dialogStep(
        login('2026-10-05T11:50:00Z'),
        registration('2026-10-05T11:55:00Z'),
        NOW,
      ),
    ).toEqual({ kind: 'email' });
    expect(
      dialogStep(
        login('2026-10-05T12:00:00Z'),
        registration('2026-10-05T11:50:00Z'),
        NOW,
      ).kind,
    ).toBe('code');
  });
});

// /register's and /login's open-the-dialog value, as proxy.ts forwards it.
describe('the tab the dialog opens on', () => {
  it("the dialog opens on /register's tab, and on the sign-in's for anything else", () => {
    expect(dialogTabOf('register')).toBe('register');
    expect(dialogTabOf('login')).toBe('login');
    expect(dialogTabOf('1')).toBe('login');
    expect(dialogTabOf(null)).toBe('login');
  });
});
