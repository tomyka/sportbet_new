import type { Role } from '@sportbet/domain';
import { describe, expect, it, vi } from 'vitest';

const signedIn = vi.hoisted(() => {
  const state: { value: null | { readonly role: Role } } = { value: null };
  return state;
});

vi.mock('../request-context', () => ({
  signedInPlayer: () => Promise.resolve(signedIn.value),
}));

const { resultsManager } = await import('./gate');

describe('the admin gate (AdminMiddleware, R-26 amended)', () => {
  it.each([
    [null, false],
    [{ role: 'player' }, false],
    [{ role: 'results-manager' }, true],
    [{ role: 'superadmin' }, true],
  ] as const)('gate: %o may enter results: %s', async (who, allowed) => {
    signedIn.value = who;
    expect((await resultsManager()) !== null).toBe(allowed);
  });
});
