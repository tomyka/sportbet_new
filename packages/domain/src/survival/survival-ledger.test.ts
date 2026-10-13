import { describe, expect, it } from 'vitest';
import { pointsWhole } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import { player, roundNo, team, unwrap } from '../testing';
import { runAfterLastLoss, streakOf, survivalLedger } from './survival-ledger';
import { SurvivalRun } from './survival-run';

const ME = player('7');
const row = (
  round: number,
  teamId: string,
  points: number | null,
  provisional = false,
): SurvivalPoints => ({
  player: ME,
  round: roundNo(round),
  team: team(teamId),
  points: points === null ? null : pointsWhole(points),
  provisional,
  storedId: null,
});
const runOf = (...picks: readonly [number, string][]) =>
  unwrap(
    SurvivalRun.stored(
      picks.map(([round, teamId]) => ({
        round: roundNo(round),
        team: team(teamId),
      })),
    ),
  );
const shown = (ledger: ReturnType<typeof survivalLedger>) =>
  ledger.map(
    (line) =>
      `${String(line.round)}:${line.team}:${line.state}:${line.points?.toString() ?? '-'}${line.provisional ? '~' : ''}`,
  );

describe('survivalLedger', () => {
  it('survival ledger: a stored row decides its round (hit > 0, lost 0)', () => {
    const run = runOf([1, 'ZAL'], [2, 'OLY']);
    expect(
      shown(survivalLedger(run, [row(1, 'ZAL', 10), row(2, 'OLY', 0)])),
    ).toEqual(['1:ZAL:survived:10.00', '2:OLY:lost:0.00']);
  });

  it('survival ledger: a pick without a stored row is pending', () => {
    expect(shown(survivalLedger(runOf([3, 'BAR']), []))).toEqual([
      '3:BAR:pending:-',
    ]);
  });

  it('survival ledger: a stored row with null points is ignored and the pick decides (planning decision 3)', () => {
    // The pick moved from REA to BAR; the derived pending row still names REA.
    expect(
      shown(survivalLedger(runOf([3, 'BAR']), [row(3, 'REA', null)])),
    ).toEqual(['3:BAR:pending:-']);
    expect(
      shown(survivalLedger(SurvivalRun.EMPTY, [row(3, 'REA', null)])),
    ).toEqual([]);
  });

  it("survival ledger: a stored row without a pick still shows (sportbet's stored rows)", () => {
    expect(
      shown(survivalLedger(SurvivalRun.EMPTY, [row(2, 'MON', 22)])),
    ).toEqual(['2:MON:survived:22.00']);
  });

  it("survival ledger: provisional is the stored row's (R-34)", () => {
    const run = runOf([1, 'PAR'], [2, 'MON']);
    expect(shown(survivalLedger(run, [row(2, 'MON', 10, true)]))).toEqual([
      '1:PAR:pending:-',
      '2:MON:survived:10.00~',
    ]);
  });

  it('survival ledger: round order', () => {
    const run = runOf([4, 'ZAL'], [2, 'OLY']);
    expect(
      survivalLedger(run, [row(3, 'BAR', 20), row(1, 'REA', 10)]).map(
        (line) => line.round,
      ),
    ).toEqual([1, 2, 3, 4]);
  });
});

describe('runAfterLastLoss and streakOf', () => {
  const ledger = (...rows: readonly [number, string, number | null][]) =>
    survivalLedger(
      runOf(
        ...rows.map(([round, teamId]): [number, string] => [round, teamId]),
      ),
      rows.flatMap(([round, teamId, points]) =>
        points === null ? [] : [row(round, teamId, points)],
      ),
    );

  it('survival run: a loss starts a new run; the lost round is not in it', () => {
    const run = runAfterLastLoss(
      ledger([1, 'A', 10], [2, 'B', 0], [3, 'C', 10], [4, 'D', null]),
    );
    expect(run.map((line) => line.round)).toEqual([3, 4]);
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
