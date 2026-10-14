import { describe, expect, it } from 'vitest';
import { CHART, chartScale } from './chart-geometry';

const BOTTOM = CHART.height - CHART.bottom;
const RIGHT = CHART.width - CHART.right;

describe('chartScale (the points chart on a 1000 x 500 box)', () => {
  it('draws 0 on the bottom edge and the top tick on the top edge', () => {
    const scale = chartScale(3, 15.5);
    expect(scale.y(0)).toBe(BOTTOM);
    expect(scale.yTicks.at(-1)?.points).toBe(20);
    expect(scale.y(20)).toBe(CHART.top);
  });

  it.each([
    [0, [0, 1]],
    [1.5, [0, 1, 2]],
    [15.5, [0, 5, 10, 15, 20]],
    [42, [0, 10, 20, 30, 40, 50]],
    [120, [0, 50, 100, 150]],
  ])(
    'a highest total of %s points ticks at round values: %j',
    (highest, ticks) => {
      expect(chartScale(2, highest).yTicks.map(({ points }) => points)).toEqual(
        ticks,
      );
    },
  );

  it('spreads the games over the width, first at the left edge and last at the right', () => {
    const scale = chartScale(5, 1);
    expect(scale.x(0)).toBe(CHART.left);
    expect(scale.x(4)).toBe(RIGHT);
    expect(scale.x(2)).toBe((CHART.left + RIGHT) / 2);
  });

  it('puts a single game in the middle', () => {
    expect(chartScale(1, 1).x(0)).toBe((CHART.left + RIGHT) / 2);
  });

  it('numbers the games from 1, every one up to 20 of them', () => {
    expect(chartScale(20, 1).xTicks.map(({ label }) => label)).toHaveLength(20);
    expect(chartScale(3, 1).xTicks.map(({ label }) => label)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('skips games past 20 so the numbers do not collide, keeping the first', () => {
    const labels = chartScale(45, 1).xTicks.map(({ label }) => label);
    expect(labels.slice(0, 3)).toEqual(['1', '4', '7']);
    expect(labels.length).toBeLessThanOrEqual(20);
  });

  it('has no x ticks without a game', () => {
    expect(chartScale(0, 0).xTicks).toEqual([]);
  });
});
