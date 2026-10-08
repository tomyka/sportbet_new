import { describe, expect, it } from 'vitest';
import type { TeamId } from '../shared/ids';
import { at, standingsSeason, team } from '../testing';
import { reorderStandings } from './reorder';

const [A, B, C, X] = [team('1'), team('2'), team('3'), team('9')];
const NOW = at('2026-10-15T12:00:00Z');
const DEADLINE = at('2026-10-21T17:00:00Z');
const SEASON = standingsSeason(DEADLINE);
const reorder = (order: readonly TeamId[], now = NOW) =>
  reorderStandings({
    order,
    target: { teams: [A, B, C], season: SEASON },
    now,
  });

describe('reorderStandings (reorderPredictionStandingsUser)', () => {
  it('standings reorder: each team its place in posted order, and nothing else', () => {
    expect(reorder([C, A, B])).toEqual({
      ok: true,
      value: [
        { team: C, place: 1 },
        { team: A, place: 2 },
        { team: B, place: 3 },
      ],
    });
  });

  it('standings reorder: an unknown, a missing or a repeated team is a mismatch', () => {
    for (const order of [
      [A, B, X],
      [A, B],
      [A, B, B],
      [A, B, C, X],
    ]) {
      expect(reorder(order)).toEqual({ ok: false, refusal: 'mismatch' });
    }
  });

  it('standings reorder: closed from the deadline, before the order is judged', () => {
    expect(reorder([A, B, C], at('2026-10-21T16:59:59Z')).ok).toBe(true);
    expect(reorder([A, B], DEADLINE)).toEqual({
      ok: false,
      refusal: 'closed',
    });
  });

  it('standings reorder: no deadline never closes', () => {
    expect(
      reorderStandings({
        order: [A, B, C],
        target: { teams: [A, B, C], season: standingsSeason(null) },
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it('standings reorder: no target is not yours, before the deadline', () => {
    expect(
      reorderStandings({
        order: [A],
        target: null,
        now: DEADLINE,
      }),
    ).toEqual({ ok: false, refusal: 'not-yours' });
  });
});
