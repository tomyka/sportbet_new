import { describe, expect, it } from 'vitest';
import { CHART, chartScale, fitSize, maxXTicks } from './chart-geometry';

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

describe('fitSize (a container’s pixels as the drawing box)', () => {
  it('is the container in whole pixels', () => {
    expect(fitSize({ width: 1203.6, height: 640.4 })).toEqual({
      width: 1204,
      height: 640,
    });
  });

  it('never goes below the floor, so the plot keeps some room', () => {
    expect(fitSize({ width: 120, height: 90 })).toEqual({
      width: 200,
      height: 200,
    });
  });

  it('is null for a container with no layout, which keeps the default', () => {
    expect(fitSize({ width: 0, height: 500 })).toBeNull();
    expect(fitSize({ width: 500, height: 0 })).toBeNull();
  });
});

describe('maxXTicks (how many x labels fit)', () => {
  it.each([
    [932, 20],
    [800, 20],
    [799, 19],
    [340, 8],
    [60, 1],
    [0, 1],
  ])('a plot %s px wide takes %s labels', (width, ticks) => {
    expect(maxXTicks(width)).toBe(ticks);
  });
});

describe('chartScale on a measured box', () => {
  const wide = { width: 2000, height: 900 };
  const narrow = { width: 360, height: 400 };

  it('draws 0 on the measured bottom edge and the top tick on the top margin', () => {
    const scale = chartScale(3, 15.5, wide);
    expect(scale.size).toEqual(wide);
    expect(scale.y(0)).toBe(wide.height - CHART.bottom);
    expect(scale.y(20)).toBe(CHART.top);
  });

  it('puts the first game at the left margin and the last at the measured right edge', () => {
    const scale = chartScale(5, 1, wide);
    expect(scale.x(0)).toBe(CHART.left);
    expect(scale.x(4)).toBe(wide.width - CHART.right);
  });

  it('puts a single game in the middle of the measured width', () => {
    expect(chartScale(1, 1, narrow).x(0)).toBe(
      (CHART.left + narrow.width - CHART.right) / 2,
    );
  });

  it('labels fewer games on a narrow box than on a wide one', () => {
    const labels = (size: typeof wide) =>
      chartScale(45, 1, size).xTicks.map(({ label }) => label);
    expect(labels(wide)).toHaveLength(15);
    expect(labels(narrow)).toEqual(['1', '8', '15', '22', '29', '36', '43']);
  });

  it('never packs labels closer than the room one needs', () => {
    for (const width of [320, 390, 768, 1280, 2400]) {
      const { xTicks } = chartScale(60, 1, { width, height: 500 });
      const gaps = xTicks
        .slice(1)
        .map((tick, at) => tick.x - (xTicks[at]?.x ?? 0));
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(40);
    }
  });
});
