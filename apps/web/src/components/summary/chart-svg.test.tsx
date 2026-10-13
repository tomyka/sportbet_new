import { fireEvent, render, screen } from '@testing-library/react';
import { must, nth } from '../../../tests/support/found';
import type { PlayerId } from '@sportbet/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  chartData,
  chartLine,
  JONAS,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { ChartSvg } from './chart-svg';
import { chartScale } from './chart-geometry';

const LINES = [
  chartLine(JONAS, 'jonas', 1, [500, 1500, 2050]),
  chartLine(ZUKAUSKAS, 'zuk', 2, [0, 700, 900]),
];
const LABELS = ['OLY - ZAL', 'REA - FEN', 'BAR - PAN'];

const draw = (
  over: {
    drawPoints?: boolean;
    hidden?: ReadonlySet<PlayerId>;
    active?: number | null;
    onActive?: (index: number | null) => void;
    lines?: typeof LINES;
    labels?: readonly string[];
  } = {},
) => {
  const chart = chartData(over.lines ?? LINES, over.labels ?? LABELS, {
    drawPoints: over.drawPoints ?? true,
  });
  const scale = chartScale(
    chart.games.length,
    Math.max(0, ...chart.lines.flatMap((line) => line.totalsCents)),
  );
  render(
    <ChartSvg
      chart={chart}
      hidden={over.hidden ?? new Set()}
      active={over.active ?? null}
      scale={scale}
      onActive={over.onActive ?? vi.fn()}
    />,
  );
  return scale;
};

/** A coordinate as the path writes it: to a tenth of a unit. */
const tenth = (value: number): string => String(Math.round(value * 10) / 10);

const paths = () => screen.queryAllByTestId('chart-line');

describe('ChartSvg (the points chart, drawn as inline SVG)', () => {
  it('one path per line, in the table order, stroked in its series token', () => {
    draw();
    expect(
      paths().map((path) => [
        path.getAttribute('data-player'),
        path.getAttribute('stroke'),
      ]),
    ).toEqual([
      ['1', 'var(--color-series-1)'],
      ['2', 'var(--color-series-2)'],
    ]);
  });

  it("a line ends at its player's total (R-85): its last point is at the total's height", () => {
    const scale = draw();
    const last = (paths()[0]?.getAttribute('d') ?? '').split(' L').at(-1);
    expect(last).toBe(`${tenth(scale.x(2))} ${tenth(scale.y(2050))}`);
  });

  it('a path starts with M at the first game and joins the rest with L', () => {
    const scale = draw();
    expect(paths()[1]?.getAttribute('d')).toBe(
      `M${tenth(scale.x(0))} ${tenth(scale.y(0))} L${tenth(scale.x(1))} ${tenth(scale.y(700))} L${tenth(scale.x(2))} ${tenth(scale.y(900))}`,
    );
  });

  it('marks every game on every line while points are drawn, and none past that', () => {
    draw();
    expect(screen.getAllByTestId('chart-point')).toHaveLength(6);
  });

  it('draws no marks when drawPoints is false (more than 40 games)', () => {
    draw({ drawPoints: false });
    expect(screen.queryAllByTestId('chart-point')).toHaveLength(0);
    expect(paths()).toHaveLength(2);
  });

  it('numbers the games along the bottom and the points up the side, in the muted token', () => {
    draw();
    const texts = Array.from(
      document.querySelectorAll('text'),
      (text) => text.textContent,
    );
    expect(texts).toEqual(
      expect.arrayContaining(['1', '2', '3', '0', '5', '10', '15', '20', '25']),
    );
    expect(document.querySelector('text')?.getAttribute('class')).toContain(
      'fill-muted',
    );
    expect(document.querySelector('line')?.getAttribute('class')).toContain(
      'stroke-border',
    );
  });

  it('a hidden line is not drawn, its marks neither', () => {
    draw({ hidden: new Set([JONAS]) });
    expect(paths().map((path) => path.getAttribute('data-player'))).toEqual([
      '2',
    ]);
    expect(screen.getAllByTestId('chart-point')).toHaveLength(3);
  });

  it('with no scored game there is no line, no mark and no hit area: only the axes', () => {
    draw({
      lines: [
        chartLine(JONAS, 'jonas', 1, []),
        chartLine(ZUKAUSKAS, 'zuk', 2, []),
      ],
      labels: [],
    });
    expect(paths()).toHaveLength(0);
    expect(screen.queryAllByTestId('chart-point')).toHaveLength(0);
    expect(screen.queryAllByTestId('chart-hit')).toHaveLength(0);
    expect(document.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('a hit area per game reports the game under the pointer, and leaving reports none', () => {
    const onActive = vi.fn();
    draw({ onActive });
    const hits = screen.getAllByTestId('chart-hit');
    expect(hits).toHaveLength(3);
    fireEvent.mouseEnter(nth(hits, 1));
    expect(onActive).toHaveBeenLastCalledWith(1);
    fireEvent.mouseLeave(must(document.querySelector('svg')));
    expect(onActive).toHaveBeenLastCalledWith(null);
  });

  it('marks the active game with a guide line', () => {
    const scale = draw({ active: 1 });
    const guide = screen.getByTestId('chart-guide');
    expect(guide.getAttribute('x1')).toBe(String(scale.x(1)));
  });

  it('has no guide when no game is active', () => {
    draw();
    expect(screen.queryByTestId('chart-guide')).toBeNull();
  });
});
