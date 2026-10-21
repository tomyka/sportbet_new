import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { goTo, said } from './admin-answer';

const world = vi.hoisted(() => {
  const state: {
    limits: readonly { key: string; maxAttempts: number }[];
    at: unknown;
    verdict: { allowed: true } | { allowed: false; minutes: number };
    working: { id: number } | null;
  } = { limits: [], at: null, verdict: { allowed: true }, working: null };
  return state;
});

vi.mock('../sign-in/throttle', () => ({
  throttle: (
    _db: unknown,
    limits: readonly { key: string; maxAttempts: number }[],
    at: unknown,
  ) => {
    world.limits = limits;
    world.at = at;
    return Promise.resolve(world.verdict);
  },
}));
vi.mock('../../server/db', () => ({ getDb: () => 'db' }));
vi.mock('./working-tournament', () => ({
  workingTournament: () => Promise.resolve(world.working),
}));

const { adminWrite, settle, withWorkingTournament } =
  await import('./admin-write');

const ADMIN = { player: player('7') };

describe('an admin write behind the throttle (adminWriteLimits: 60 a minute per account)', () => {
  it('writes while the account is within its limit, counted under its own key, with the database and the moment it was counted at', async () => {
    world.verdict = { allowed: true };
    const seen: unknown[] = [];
    const answer = await adminWrite(ADMIN, '/admin/games', (context) => {
      seen.push(context.db, context.now);
      return Promise.resolve(said('/admin/games', 'round-added'));
    });
    expect(answer).toEqual(said('/admin/games', 'round-added'));
    expect(seen).toEqual(['db', world.at]);
    expect(world.limits).toEqual([
      { key: 'admin-write:player:7', maxAttempts: 60, windowSeconds: 60 },
    ]);
  });

  it('writes nothing past it, and tells the page for how long', async () => {
    world.verdict = { allowed: false, minutes: 1 };
    const write = vi.fn();
    const answer = await adminWrite(ADMIN, '/admin/games', write);
    expect(write).not.toHaveBeenCalled();
    expect(answer).toEqual({
      kind: 'redirect',
      to: '/admin/games',
      flash: { kind: 'throttled', minutes: 1 },
    });
  });
});

describe('the tournament an admin works on', () => {
  it('is handed to what follows', async () => {
    world.working = { id: 3 };
    const answer = await withWorkingTournament(
      ADMIN,
      '/admin/games',
      (tournament) => Promise.resolve(goTo(`/t/${String(tournament.id)}`)),
    );
    expect(answer).toEqual(goTo('/t/3'));
  });

  it('is missing: the page says so, and nothing follows', async () => {
    world.working = null;
    const then = vi.fn();
    const answer = await withWorkingTournament(ADMIN, '/admin/teams', then);
    expect(answer).toEqual(said('/admin/teams', 'no-tournament'));
    expect(then).not.toHaveBeenCalled();
  });
});

describe('a writer outcome as the answer', () => {
  it('a refusal is the message of its own name on the page', () => {
    expect(
      settle({ ok: false, refusal: 'no-tournament' }, '/admin/games', goTo),
    ).toEqual(said('/admin/games', 'no-tournament'));
  });

  it('a success is what the action makes of its value', () => {
    expect(
      settle({ ok: true, value: '/next' }, '/admin/games', (to) => goTo(to)),
    ).toEqual(goTo('/next'));
  });
});
