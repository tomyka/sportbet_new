import { createDb } from '@sportbet/db';
import { at, player } from '@sportbet/domain/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { said } from './admin-answer';

const throttleCalls = vi.hoisted(() => {
  const state: {
    limits: readonly { key: string; maxAttempts: number }[];
    verdict: { allowed: true } | { allowed: false; minutes: number };
  } = { limits: [], verdict: { allowed: true } };
  return state;
});

vi.mock('../sign-in/throttle', () => ({
  throttle: (
    _db: unknown,
    limits: readonly { key: string; maxAttempts: number }[],
  ) => {
    throttleCalls.limits = limits;
    return Promise.resolve(throttleCalls.verdict);
  },
}));

const { throttledWrite } = await import('./throttled-write');

// The throttle is the fake's: the pool connects only when queried, and is not.
const { db: DB, close } = createDb(
  'postgres://nobody:nothing@127.0.0.1:1/none',
);
afterAll(close);
const INPUT = {
  player: player('7'),
  now: at('2026-10-14T12:00:00Z'),
  to: '/admin/games',
};

describe('an admin write behind the throttle (adminWriteLimits: 60 a minute per account)', () => {
  it('writes while the account is within its limit, counted under its own key', async () => {
    throttleCalls.verdict = { allowed: true };
    const write = vi.fn(() =>
      Promise.resolve(said('/admin/games', 'round-added')),
    );
    const answer = await throttledWrite(DB, INPUT, write);
    expect(write).toHaveBeenCalledOnce();
    expect(answer).toEqual(said('/admin/games', 'round-added'));
    expect(throttleCalls.limits).toEqual([
      { key: 'admin-write:player:7', maxAttempts: 60, windowSeconds: 60 },
    ]);
  });

  it('writes nothing past it, and tells the page for how long', async () => {
    throttleCalls.verdict = { allowed: false, minutes: 1 };
    const write = vi.fn();
    const answer = await throttledWrite(DB, INPUT, write);
    expect(write).not.toHaveBeenCalled();
    expect(answer).toEqual({
      kind: 'redirect',
      to: '/admin/games',
      flash: { kind: 'throttled', minutes: 1 },
    });
  });
});
