// Where the points chart's marks go on its drawing box. Only layout: what
// each line's values are is the domain's (pointsChart). Values are points
// (centsToPoints), not cents.

/**
 * The drawing box and the room the axes take. One SVG unit is one screen
 * pixel once the chart is measured (`fitSize`), so text, strokes and marks
 * keep their size at any width; `width` and `height` are the box the server
 * renders before the browser has measured.
 */
export const CHART = {
  width: 1000,
  height: 500,
  left: 48,
  right: 20,
  top: 20,
  bottom: 36,
} as const;

/** The size of the drawing box, in SVG units (pixels). */
export interface ChartSize {
  readonly width: number;
  readonly height: number;
}

/** What the server renders and the tests draw before anything is measured. */
export const DEFAULT_SIZE: ChartSize = {
  width: CHART.width,
  height: CHART.height,
};

/** A box smaller than this would leave the plot no room: clamp to it. */
const MIN_SIZE = 200;

/**
 * The drawing box for a container's pixel size: whole pixels, never below
 * MIN_SIZE, and null for a container with no layout (hidden, or jsdom), which
 * keeps the default.
 */
export function fitSize(box: ChartSize): ChartSize | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    width: Math.max(MIN_SIZE, Math.round(box.width)),
    height: Math.max(MIN_SIZE, Math.round(box.height)),
  };
}

/** Chart.js's maxTicksLimit on the x axis. */
const MAX_X_TICKS = 20;

/** The room one x label needs (three digits and a gap), in pixels. */
const X_LABEL_SPACE = 40;

/** The y axis ticks at most this many steps above 0. */
const MAX_Y_STEPS = 5;

export interface ChartScale {
  size: ChartSize;
  x(index: number): number;
  y(points: number): number;
  yTicks: readonly { points: number; y: number }[];
  xTicks: readonly { index: number; x: number; label: string }[];
}

/** The smallest 1, 2, 5, 10, 20, 50... step that needs at most MAX_Y_STEPS above `points`. */
function stepFor(points: number): number {
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const unit of [1, 2, 5]) {
      const step = unit * magnitude;
      if (Math.ceil(points / step) <= MAX_Y_STEPS) return step;
    }
  }
}

/** How many x labels fit along a plot `plotWidth` pixels wide: at most Chart.js's 20, at least 1. */
export function maxXTicks(plotWidth: number): number {
  return Math.max(
    1,
    Math.min(MAX_X_TICKS, Math.floor(plotWidth / X_LABEL_SPACE)),
  );
}

/**
 * The scale for `games` x positions and values up to `highest` points (the
 * axis starts at 0), on a box of `size`.
 */
export function chartScale(
  games: number,
  highest: number,
  size: ChartSize = DEFAULT_SIZE,
): ChartScale {
  const step = stepFor(highest);
  const top = step * Math.max(1, Math.ceil(highest / step));
  const plotWidth = size.width - CHART.left - CHART.right;
  const plotHeight = size.height - CHART.top - CHART.bottom;
  const x = (index: number): number =>
    games <= 1
      ? CHART.left + plotWidth / 2
      : CHART.left + (index * plotWidth) / (games - 1);
  const y = (points: number): number =>
    CHART.top + plotHeight - (points / top) * plotHeight;
  const every = Math.ceil(games / maxXTicks(plotWidth));
  return {
    size,
    x,
    y,
    yTicks: Array.from({ length: top / step + 1 }, (_, at) => ({
      points: at * step,
      y: y(at * step),
    })),
    xTicks: Array.from({ length: Math.ceil(games / every) }, (_, at) => ({
      index: at * every,
      x: x(at * every),
      label: String(at * every + 1),
    })),
  };
}
