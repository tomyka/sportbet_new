import { at, player, testPlayer } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { PendingSignIn } from './pending';
import { beforeTheLoginCode } from './verify-steps';

// EmailCodeLoginController::verify before a code is checked: the
// throttle, a code typed, an address the code went to - in that order.

const PENDING: PendingSignIn = {
  email: testPlayer(player('1'), 'jonas').email,
  sentAt: at('2026-10-08T12:00:00Z'),
};

const ALLOWED = { allowed: true } as const;

describe('beforeTheLoginCode', () => {
  it("too many tries: the throttle's text on the code, before anything else", () => {
    expect(
      beforeTheLoginCode({
        verdict: { allowed: false, minutes: 2 },
        code: '',
        pending: null,
      }),
    ).toEqual({
      ok: false,
      state: {
        kind: 'refused',
        field: 'code',
        message: 'Per daug bandymų. Pabandykite dar kartą po 2 min.',
      },
    });
  });

  it('no code typed: "Įveskite kodą."', () => {
    expect(
      beforeTheLoginCode({ verdict: ALLOWED, code: '', pending: PENDING }),
    ).toEqual({
      ok: false,
      state: { kind: 'refused', field: 'code', message: 'Įveskite kodą.' },
    });
  });

  it('no address pending: "Pirmiausia įveskite el. pašto adresą."', () => {
    expect(
      beforeTheLoginCode({ verdict: ALLOWED, code: '12345678', pending: null }),
    ).toEqual({
      ok: false,
      state: {
        kind: 'refused',
        field: 'code',
        message: 'Pirmiausia įveskite el. pašto adresą.',
      },
    });
  });

  it('all there: the address to check the code for', () => {
    expect(
      beforeTheLoginCode({
        verdict: ALLOWED,
        code: '12345678',
        pending: PENDING,
      }),
    ).toEqual({ ok: true, pending: PENDING });
  });
});
