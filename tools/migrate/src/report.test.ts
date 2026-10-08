import { describe, expect, it } from 'vitest';
import { parityReport } from './parity/report';
import { emptyReport, exitStatusOf, renderReport } from './report';

const table = {
  table: 'games' as const,
  inDump: 2,
  read: 2,
  loaded: 1,
  skipped: {},
  refused: { 'same-team-twice': 1 },
  refusals: [{ reason: 'same-team-twice', row: 'id 9' }],
  fromParent: { skipped: {}, refused: {} },
};

describe('the exit status', () => {
  it('is 0 when nothing was refused', () => {
    expect(
      exitStatusOf({
        ...emptyReport(),
        tables: [{ ...table, refused: {}, refusals: [] }],
      }),
    ).toBe(0);
  });

  it('is 1 when a row, or a recalculation, was refused', () => {
    expect(exitStatusOf({ ...emptyReport(), tables: [table] })).toBe(1);
    expect(
      exitStatusOf({
        ...emptyReport(),
        recalculations: [
          { tournament: 2, rules: 'ruled', refusal: 'odds-missing' },
        ],
      }),
    ).toBe(1);
  });

  it('is 1 with --parity when a row is new-code-wrong or could not be compared, 0 when parity holds', () => {
    const parity = parityReport({ tag: '3eb95e7', backup: 'backup' }, [], []);
    expect(exitStatusOf({ ...emptyReport(), parity })).toBe(0);
    expect(
      exitStatusOf({
        ...emptyReport(),
        parity: { ...parity, newCodeWrong: 1 },
      }),
    ).toBe(1);
    expect(
      exitStatusOf({ ...emptyReport(), parity: { ...parity, refused: 1 } }),
    ).toBe(1);
  });

  it("is 1 with --parity when the old app's copy holds a row refused with its parent, 0 when its drops are only skipped", () => {
    /** An old-app table whose every skip and refusal came from a parent. */
    const oldAppTable = (
      skipped: Record<string, number>,
      refused: Record<string, number>,
    ) => ({
      table: 'point_results' as const,
      read: 1,
      loaded: 0,
      skipped,
      refused,
      refusals: Object.keys(refused).map((reason) => ({ reason, row: '' })),
      fromParent: { skipped, refused },
    });
    const withOldApp = (table: ReturnType<typeof oldAppTable>) => ({
      ...emptyReport(),
      parity: parityReport({ tag: '3eb95e7', backup: 'backup' }, [], [table]),
    });
    // An orphan only sportbet's recalculation made: it never reaches the comparison.
    expect(exitStatusOf(withOldApp(oldAppTable({}, { orphan: 1 })))).toBe(1);
    // A football tournament's rows, skipped with it: printed, not a failure.
    expect(
      exitStatusOf(withOldApp(oldAppTable({ 'not-euroleague': 1 }, {}))),
    ).toBe(0);
  });

  it('is 2 when the run could not complete', () => {
    expect(
      exitStatusOf({ ...emptyReport(), tables: [table], problem: 'no dump' }),
    ).toBe(2);
  });
});

describe('the printed report', () => {
  it('prints the parity report after the load report, ending with its verdict', () => {
    const text = renderReport({
      ...emptyReport(),
      parity: parityReport({ tag: '3eb95e7', backup: 'backup' }, [], []),
    });
    expect(text).toContain('parity against sportbet 3eb95e7, backup backup');
    expect(text).toContain('PARITY HOLDS');
    expect(text.indexOf('PARITY HOLDS')).toBeLessThan(text.indexOf('exit    '));
  });

  it('names a refused row no player owns by its sportbet id', () => {
    expect(renderReport({ ...emptyReport(), tables: [table] })).toContain(
      'refused same-team-twice: id 9',
    );
  });

  it("counts each points table's rows per source, in POINTS_SOURCES order", () => {
    const sources = (production: number, sportbet: number, ruled: number) => ({
      production,
      sportbet,
      ruled,
    });
    const printed = renderReport({
      ...emptyReport(),
      points: [
        {
          tournament: 2,
          rows: {
            game_odds: sources(4, 3, 3),
            match_points: sources(9, 9, 8),
            standings_points: sources(8, 8, 8),
            survival_points: sources(5, 5, 0),
          },
        },
      ],
    }).split('\n');
    expect(printed).toEqual(
      expect.arrayContaining([
        'points of tournament 2 (production / sportbet / ruled)',
        '        game_odds         4 / 3 / 3',
        '        match_points      9 / 9 / 8',
        '        standings_points  8 / 8 / 8',
        '        survival_points   5 / 5 / 0',
      ]),
    );
  });
});
