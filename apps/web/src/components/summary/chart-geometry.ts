// Where the points chart's marks go on its drawing box. Only layout: what
// each line's values are is the domain's (pointsChart). Values are points
// (centsToPoints), not cents.

/** The drawing box and the room the axes take, in SVG units. */
export const CHART = {
  width: 1000,
  height: 500,
  left: 48,
  right: 20,
  top: 20,
  bottom: 36,
} as const;

/** Chart.js's maxTicksLimit on the x axis. */
const MAX_X_TICKS = 20;

/** The y axis ticks at most this many steps above 0. */
const MAX_Y_STEPS = 5;

export interface ChartScale {
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

/** The scale for `games` x positions and values up to `highest` points (the axis starts at 0). */
export function chartScale(games: number, highest: number): ChartScale {
  const step = stepFor(highest);
  const top = step * Math.max(1, Math.ceil(highest / step));
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (index: number): number =>
    games <= 1
      ? CHART.left + plotWidth / 2
      : CHART.left + (index * plotWidth) / (games - 1);
  const y = (points: number): number =>
    CHART.top + plotHeight - (points / top) * plotHeight;
  const every = Math.ceil(games / MAX_X_TICKS);
  return {
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
