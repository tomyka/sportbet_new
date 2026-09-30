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
});
