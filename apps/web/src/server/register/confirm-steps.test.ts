import { at, player, testPlayer } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { beforeTheCode } from './confirm-steps';
import type { PendingRegistration } from './pending-registration';

// RegisteredUserController::confirm before a code is checked: the
// throttle, a code typed, a registration to confirm - in that order.

const PENDING: PendingRegistration = {
  username: 'jonas',
  name: 'Jonas',
  surname: 'Jonaitis',
  email: testPlayer(player('1'), 'jonas').email,
  tournament: null,
  sentAt: at('2026-10-08T12:00:00Z'),
};

const ALLOWED = { allowed: true } as const;

describe('beforeTheCode', () => {
  it("too many tries: the throttle's text, before anything else", () => {
    expect(
      beforeTheCode({
        verdict: { allowed: false, minutes: 3 },
        code: '',
        pending: null,
      }),
    ).toEqual({
      ok: false,
      state: {
        kind: 'code-refused',
        message: 'Per daug bandymų. Pabandykite dar kartą po 3 min.',
      },
    });
  });

  it('no code typed: "Įveskite kodą."', () => {
    expect(
      beforeTheCode({ verdict: ALLOWED, code: '', pending: PENDING }),
    ).toEqual({
      ok: false,
      state: { kind: 'code-refused', message: 'Įveskite kodą.' },
    });
  });

  it('no registration to confirm: "Pirmiausia užpildykite registracijos formą."', () => {
    expect(
      beforeTheCode({ verdict: ALLOWED, code: '12345678', pending: null }),
    ).toEqual({
      ok: false,
      state: {
        kind: 'code-refused',
        message: 'Pirmiausia užpildykite registracijos formą.',
      },
    });
  });

  it('all there: the registration to confirm', () => {
    expect(
      beforeTheCode({ verdict: ALLOWED, code: '12345678', pending: PENDING }),
    ).toEqual({ ok: true, pending: PENDING });
  });
});
