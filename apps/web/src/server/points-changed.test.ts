import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidated = vi.hoisted(() => {
  const state: { calls: unknown[][] } = { calls: [] };
  return state;
});

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => {
    revalidated.calls.push(args);
  },
}));

const { DERIVED_POINTS_TAG, expireBoard } = await import('./points-changed');

beforeEach(() => {
  revalidated.calls = [];
});

describe('expireBoard', () => {
  it('expires every derived-points cache at once when the writer says the board changed, and hands the result back', () => {
    const written = { boardChanged: true, id: 4 };
    expect(expireBoard(written)).toBe(written);
    expect(revalidated.calls).toEqual([[DERIVED_POINTS_TAG, { expire: 0 }]]);
  });

  it('expires nothing when the writer says nothing moved', () => {
    const written = { boardChanged: false };
    expect(expireBoard(written)).toBe(written);
    expect(revalidated.calls).toEqual([]);
  });
});
