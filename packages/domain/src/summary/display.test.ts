import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import type { CompareSide } from './compare';
import {
  compareStats,
  earnedStages,
  isEarned,
  markOf,
  shownSum,
} from './display';

describe('markOf', () => {
  it.each([
    [3, 2, 'win'],
    [2, 3, 'lose'],
    [2, 2, 'tie'],
    [0, 0, 'tie'],
    [-1, -2, 'win'],
  ] as const)('%s against %s is %s', (mine, theirs, mark) => {
    expect(markOf(mine, theirs)).toBe(mark);
  });
});

describe('what a sum shows once it has earned something', () => {
  it.each([
    [1, true],
    [0, false],
    [-1, false],
    [undefined, false],
  ] as const)('isEarned(%s) is %s', (points, earned) => {
    expect(isEarned(points)).toBe(earned);
  });

  it('shownSum is the sum above 0 and null otherwise', () => {
    expect(shownSum(2_600)).toBe(2_600);
    expect(shownSum(0)).toBeNull();
    expect(shownSum(-5)).toBeNull();
    expect(shownSum(undefined)).toBeNull();
  });
});

describe('earnedStages', () => {
  it('lists the stages above 0 in sportbet`s stage order', () => {
    expect(
      earnedStages({ place: 19_000, playOffs: 0, finalFour: 5, final: 1 }),
    ).toEqual(['place', 'finalFour', 'final']);
  });

  it('lists none when nothing is earned', () => {
    expect(
      earnedStages({ place: 0, playOffs: 0, finalFour: 0, final: 0 }),
    ).toEqual([]);
  });
});

describe('compareStats', () => {
  const side = (parts: Partial<CompareSide>): CompareSide => ({
    player: player('1'),
    username: 'ada',
    rank: 1,
    totalCents: 0,
    matchCents: 0,
    standingsCents: 0,
    survivalCents: 0,
    serijaCents: 0,
    bingo: 0,
    ...parts,
  });

  it('lists match, standings, serija and bingo always, each with both values and marks', () => {
    const stats = compareStats(
      side({ matchCents: 500, standingsCents: 100, serijaCents: 0, bingo: 2 }),
      side({ matchCents: 400, standingsCents: 100, serijaCents: 50, bingo: 2 }),
    );
    expect(stats.map(({ kind }) => kind)).toEqual([
      'match',
      'standings',
      'serija',
      'bingo',
    ]);
    expect(stats.map(({ me, them }) => [me, them])).toEqual([
      [500, 400],
      [100, 100],
      [0, 50],
      [2, 2],
    ]);
    expect(stats.map(({ meMark, themMark }) => [meMark, themMark])).toEqual([
      ['win', 'lose'],
      ['tie', 'tie'],
      ['lose', 'win'],
      ['tie', 'tie'],
    ]);
  });

  it('leaves survival out while both sides are at 0', () => {
    const stats = compareStats(side({}), side({}));
    expect(stats.some(({ kind }) => kind === 'survival')).toBe(false);
  });

  it.each([
    [100, 0],
    [0, 100],
    [100, 100],
  ])(
    'shows survival, between standings and serija, once either side has some (%s, %s)',
    (mine, theirs) => {
      const stats = compareStats(
        side({ survivalCents: mine }),
        side({ survivalCents: theirs }),
      );
      expect(stats.map(({ kind }) => kind)).toEqual([
        'match',
        'standings',
        'survival',
        'serija',
        'bingo',
      ]);
    },
  );
});
