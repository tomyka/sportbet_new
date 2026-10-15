import { describe, expect, it } from 'vitest';
import { gameNo, leagueNo, player } from '../testing';
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
    ['an unknown kind', { kind: 'delete-tournament', game: 12 }],
    ['another kind carrying the game', { kind: 'delete-user', game: 12 }],
    [
      'a game deletion with an extra key',
      { kind: 'delete-game', game: 12, player: '1' },
    ],
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

describe('confirmableActionSchema: slice 14 kinds', () => {
  it('confirmable action: each kind names exactly its own fields', () => {
    expect(
      confirmableActionSchema.parse({ kind: 'delete-user', player: '7' }),
    ).toEqual({ kind: 'delete-user', player: player('7') });
    expect(
      confirmableActionSchema.parse({
        kind: 'change-role',
        player: '7',
        role: 'results-manager',
      }),
    ).toEqual({
      kind: 'change-role',
      player: player('7'),
      role: 'results-manager',
    });
    expect(
      confirmableActionSchema.parse({
        kind: 'delete-league-message',
        message: 5,
      }),
    ).toEqual({ kind: 'delete-league-message', message: 5 });
    expect(
      confirmableActionSchema.parse({ kind: 'delete-league', league: 9 }),
    ).toEqual({ kind: 'delete-league', league: leagueNo(9) });
  });

  it.each([
    ['delete-user without a player', { kind: 'delete-user' }],
    [
      'delete-user with a player that is no id',
      { kind: 'delete-user', player: 'x' },
    ],
    ['delete-user with a leading zero', { kind: 'delete-user', player: '07' }],
    [
      'delete-user with an id past the column',
      { kind: 'delete-user', player: '2147483648' },
    ],
    ['delete-user with a numeric player', { kind: 'delete-user', player: 7 }],
    [
      'delete-user with an array player',
      { kind: 'delete-user', player: ['7'] },
    ],
    [
      'delete-user with an extra key',
      { kind: 'delete-user', player: '7', role: 'player' },
    ],
    ['change-role without a role', { kind: 'change-role', player: '7' }],
    ['change-role without a player', { kind: 'change-role', role: 'player' }],
    [
      'change-role with an unknown role',
      { kind: 'change-role', player: '7', role: 'admin' },
    ],
    [
      'change-role with a sportbet level',
      { kind: 'change-role', player: '7', role: '9' },
    ],
    [
      'change-role with an extra key',
      { kind: 'change-role', player: '7', role: 'player', game: 1 },
    ],
    [
      'delete-league-message without a message',
      { kind: 'delete-league-message' },
    ],
    [
      'delete-league-message with a zero message',
      { kind: 'delete-league-message', message: 0 },
    ],
    [
      'delete-league-message with a text message',
      { kind: 'delete-league-message', message: '5' },
    ],
    [
      'delete-league-message with an extra key',
      { kind: 'delete-league-message', message: 5, league: 1 },
    ],
    ['delete-league without a league', { kind: 'delete-league' }],
    [
      'delete-league with a league past the column',
      { kind: 'delete-league', league: 2_147_483_648 },
    ],
    [
      'delete-league with a message',
      { kind: 'delete-league', league: 1, message: 1 },
    ],
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
