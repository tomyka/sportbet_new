import { describe, expect, it } from 'vitest';
import { pointsWhole, Points } from '../points/points';
import { roundNo, team } from '../testing';
import type { SurvivalRow } from './survival-fold';
import { runAfterLastLoss, streakOf } from './survival-ledger';

const line = (
  round: number,
  teamId: string,
  points: number | null,
): SurvivalRow => ({
  round: roundNo(round),
  team: team(teamId),
  state: points === null ? 'pending' : points > 0 ? 'survived' : 'lost',
  points:
    points === null ? null : points === 0 ? Points.ZERO : pointsWhole(points),
  provisional: false,
});

describe('runAfterLastLoss and streakOf', () => {
  const ledger = (...lines: readonly [number, string, number | null][]) =>
    lines.map(([round, teamId, points]) => line(round, teamId, points));

  it('survival run: a loss starts a new run; the lost round is not in it', () => {
    const run = runAfterLastLoss(
      ledger([1, 'A', 10], [2, 'B', 0], [3, 'C', 10], [4, 'D', null]),
    );
    expect(run.map((each) => each.round)).toEqual([3, 4]);
  });

  it('survival run: with no loss it is the whole ledger', () => {
    expect(runAfterLastLoss(ledger([1, 'A', 10], [2, 'B', null]))).toHaveLength(
      2,
    );
    expect(runAfterLastLoss([])).toEqual([]);
  });

  it('survival run: the streak counts survived rounds, a pending one neither counts nor ends it', () => {
    expect(
      streakOf(
        runAfterLastLoss(ledger([1, 'A', 10], [2, 'B', null], [3, 'C', 20])),
      ),
    ).toBe(2);
    expect(streakOf(runAfterLastLoss(ledger([1, 'A', 10], [2, 'B', 0])))).toBe(
      0,
    );
    expect(streakOf([])).toBe(0);
  });
});
