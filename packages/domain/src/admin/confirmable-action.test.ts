import { describe, expect, it } from 'vitest';
import { gameNo, player } from '../testing';
import {
  adminConfirmCheckLimits,
  adminConfirmRequestLimits,
  confirmableActionSchema,
} from './confirmable-action';

// R-26 amended: a destructive superadmin action is confirmed with a fresh
// code emailed at that moment.

describe('confirmableActionSchema', () => {
  it('confirmable action: a game deletion names its game', () => {
    expect(
      confirmableActionSchema.parse({ kind: 'delete-game', game: 12 }),
    ).toEqual({ kind: 'delete-game', game: gameNo(12) });
  });

  it.each([
    ['an unknown kind', { kind: 'delete-user', game: 12 }],
    ['no kind', { game: 12 }],
    ['no game', { kind: 'delete-game' }],
    ['a game that is not a whole number', { kind: 'delete-game', game: 1.5 }],
    ['a game of zero', { kind: 'delete-game', game: 0 }],
    ['a negative game', { kind: 'delete-game', game: -3 }],
    ['a game past the column', { kind: 'delete-game', game: 2_147_483_648 }],
    ['a game as text', { kind: 'delete-game', game: '12' }],
    ['nothing', null],
  ])('confirmable action: %s is refused', (_label, body) => {
    expect(confirmableActionSchema.safeParse(body).success).toBe(false);
  });
});

describe('admin confirmation throttles (R-26 amended)', () => {
  it('throttle: 5 codes mailed per 10 minutes per admin', () => {
    expect(adminConfirmRequestLimits(player('7'))).toEqual([
      {
        key: 'admin-confirm-code:player:7',
        maxAttempts: 5,
        windowSeconds: 600,
      },
    ]);
  });

  it('throttle: 10 code checks per 10 minutes per admin', () => {
    expect(adminConfirmCheckLimits(player('7'))).toEqual([
      {
        key: 'admin-confirm-check:player:7',
        maxAttempts: 10,
        windowSeconds: 600,
      },
    ]);
  });

  it('throttle: each admin has their own windows', () => {
    expect(adminConfirmRequestLimits(player('7'))[0]?.key).not.toBe(
      adminConfirmRequestLimits(player('8'))[0]?.key,
    );
    expect(adminConfirmCheckLimits(player('7'))[0]?.key).not.toBe(
      adminConfirmCheckLimits(player('8'))[0]?.key,
    );
  });
});
