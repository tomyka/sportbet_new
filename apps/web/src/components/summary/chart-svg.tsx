import type { JSX } from 'react';
import type { ChartLine, PlayerId, PointsChart } from '@sportbet/domain';
import { CHART, type ChartScale } from './chart-geometry';

/** A line's colour: its series token (`--color-series-1` to `10`), the same in both themes. */
export const seriesColour = (line: ChartLine): string =>
  `var(--color-series-${String(line.series)})`;

const BOTTOM = CHART.height - CHART.bottom;

/** "M x y L x y ...", to a tenth of a unit. */
function pathOf(scale: ChartScale, line: ChartLine): string {
  return line.totalsCents
    .map((cents, index) => {
      const at = `${String(Math.round(scale.x(index) * 10) / 10)} ${String(Math.round(scale.y(cents) * 10) / 10)}`;
      return `${index === 0 ? 'M' : 'L'}${at}`;
    })
    .join(' ');
}

/** The grid and the axes' numbers: one gridline and label per y tick, one label per x tick. */
function Axes({ scale }: { scale: ChartScale }): JSX.Element {
  return (
    <>
      {scale.yTicks.map(({ cents, y }) => (
        <g key={cents}>
          <line
            x1={CHART.left}
            x2={CHART.width - CHART.right}
            y1={y}
            y2={y}
            className="stroke-border"
          />
          <text
            x={CHART.left - 8}
            y={y + 4}
            textAnchor="end"
            fontSize={13}
            className="fill-muted"
          >
            {String(cents / 100)}
          </text>
        </g>
      ))}
      {scale.xTicks.map(({ index, x, label }) => (
        <text
          key={index}
          x={x}
          y={BOTTOM + 22}
          textAnchor="middle"
          fontSize={13}
          className="fill-muted"
        >
          {label}
        </text>
      ))}
    </>
  );
}

/** A line and, while points are drawn, a mark at each game. */
function Series({
  line,
  scale,
  marks,
}: {
  line: ChartLine;
  scale: ChartScale;
  marks: boolean;
}): JSX.Element {
  const colour = seriesColour(line);
  return (
    <>
      {line.totalsCents.length === 0 ? null : (
        <path
          data-testid="chart-line"
          data-player={line.player}
          d={pathOf(scale, line)}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {marks
        ? line.totalsCents.map((cents, index) => (
            <circle
              // A line holds one value per game.
              key={index}
              data-testid="chart-point"
              cx={scale.x(index)}
              cy={scale.y(cents)}
              r={3}
              fill={colour}
            />
          ))
        : null}
    </>
  );
}

/** An invisible column per game, as wide as the games are apart, that reports the pointer over it. */
function HitAreas({
  chart,
  scale,
  onActive,
}: {
  chart: PointsChart;
  scale: ChartScale;
  onActive: (index: number | null) => void;
}): JSX.Element {
  const slot =
    (CHART.width - CHART.left - CHART.right) /
    Math.max(chart.games.length - 1, 1);
  return (
    <>
      {chart.games.map(({ game }, index) => (
        <rect
          key={game}
          data-testid="chart-hit"
          x={scale.x(index) - slot / 2}
          y={CHART.top}
          width={slot}
          height={BOTTOM - CHART.top}
          fill="transparent"
          onMouseEnter={() => {
            onActive(index);
          }}
        />
      ))}
    </>
  );
}

/**
 * The points chart as inline SVG (sportbet's Chart.js line chart, without a
 * library): axes, one line per visible player in their series colour, marks
 * up to 40 games, and a hit area per game that reports the pointer. It is a
 * complete static chart without JavaScript.
 */
export function ChartSvg({
  chart,
  hidden,
  active,
  scale,
  onActive,
}: {
  chart: PointsChart;
  hidden: ReadonlySet<PlayerId>;
  active: number | null;
  scale: ChartScale;
  onActive: (index: number | null) => void;
}): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${String(CHART.width)} ${String(CHART.height)}`}
      className="block h-auto w-full"
      onMouseLeave={() => {
        onActive(null);
      }}
    >
      <Axes scale={scale} />
      {active === null ? null : (
        <line
          data-testid="chart-guide"
          x1={scale.x(active)}
          x2={scale.x(active)}
          y1={CHART.top}
          y2={BOTTOM}
          className="stroke-border-strong"
        />
      )}
      {chart.lines
        .filter((line) => !hidden.has(line.player))
        .map((line) => (
          <Series
            key={line.player}
            line={line}
            scale={scale}
            marks={chart.drawPoints}
          />
        ))}
      <HitAreas chart={chart} scale={scale} onActive={onActive} />
    </svg>
  );
}
