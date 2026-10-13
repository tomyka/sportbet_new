import { describe, expect, it } from 'vitest';
import { pointsWhole } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import { player, roundNo, team, unwrap } from '../testing';
import { survivalLedger } from './survival-ledger';
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
