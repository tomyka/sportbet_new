import { describe, expect, it } from 'vitest';
import { emptyReport, exitStatusOf, renderReport } from './report';

const table = {
  table: 'games' as const,
  inDump: 2,
  read: 2,
  loaded: 1,
  skipped: {},
  refused: { 'same-team-twice': 1 },
  refusals: [{ reason: 'same-team-twice', row: 'id 9' }],
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

  it('is 2 when the run could not complete', () => {
    expect(
      exitStatusOf({ ...emptyReport(), tables: [table], problem: 'no dump' }),
    ).toBe(2);
  });
});

describe('the printed report', () => {
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
