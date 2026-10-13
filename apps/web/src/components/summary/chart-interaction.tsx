'use client';

import type { JSX, KeyboardEvent } from 'react';
import { useState } from 'react';
import {
  onePlace,
  type ChartLine,
  type PlayerId,
  type PointsChart,
} from '@sportbet/domain';
import { CHART, chartScale } from './chart-geometry';
import { ChartSvg, seriesColour } from './chart-svg';

/** The tooltip's side flips past this share of the width, so it stays on the chart. */
const FLIP_AT = 60;

/** The tooltip's title: the game's label, or "Žaidimas {i}" without one. */
const titleOf = (chart: PointsChart, index: number): string => {
  const label = chart.games[index]?.label ?? '';
  return label === '' ? `Žaidimas ${String(index + 1)}` : label;
};

/** The game a key moves to from `active` (the latest when none is active), or null for another key. */
function movedTo(
  key: string,
  active: number | null,
  games: number,
): number | null {
  const last = games - 1;
  const from = active ?? last;
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, from - 1);
    case 'ArrowRight':
      return Math.min(last, from + 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

/** Chart.js's tooltip: the game's title, then "{username}:  {value} t." for each line showing. */
function Tooltip({
  chart,
  lines,
  index,
  x,
}: {
  chart: PointsChart;
  lines: readonly ChartLine[];
  index: number;
  x: number;
}): JSX.Element {
  const share = (x / CHART.width) * 100;
  return (
    <div
      role="tooltip"
      style={{ left: `${String(share)}%` }}
      className={`pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface-2 p-3 text-[0.78rem] text-text ${share > FLIP_AT ? '-translate-x-[calc(100%+8px)]' : 'translate-x-2'}`}
    >
      <b className="mb-1 block text-muted">{titleOf(chart, index)}</b>
      <ul className="m-0 list-none p-0">
        {lines.map((line) => (
          <li
            key={line.player}
            className="flex items-center gap-1.5 whitespace-pre"
          >
            <span
              className="size-2 flex-none rounded-full"
              style={{ backgroundColor: seriesColour(line) }}
            />
            {`${line.username}:  ${onePlace(line.totalsCents[index] ?? 0)} t.`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The legend: a button per player that shows or hides their line (Chart.js's legend click). */
function Legend({
  lines,
  hidden,
  onToggle,
}: {
  lines: readonly ChartLine[];
  hidden: ReadonlySet<PlayerId>;
  onToggle: (player: PlayerId) => void;
}): JSX.Element {
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-5 gap-y-2 p-4">
      {lines.map((line) => (
        <li key={line.player}>
          <button
            type="button"
            aria-pressed={!hidden.has(line.player)}
            onClick={() => {
              onToggle(line.player);
            }}
            className="inline-flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-[0.75rem] text-text aria-[pressed=false]:line-through aria-[pressed=false]:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span
              data-testid="chart-dot"
              className="size-2.5 flex-none rounded-full"
              style={{ backgroundColor: seriesColour(line) }}
            />
            {line.username}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The players whose lines are hidden, and the toggle a legend click flips one with. */
function useHiddenLines(): [ReadonlySet<PlayerId>, (player: PlayerId) => void] {
  const [hidden, setHidden] = useState<ReadonlySet<PlayerId>>(new Set());
  const toggle = (player: PlayerId) => {
    setHidden((was) => {
      const next = new Set(was);
      if (!next.delete(player)) next.add(player);
      return next;
    });
  };
  return [hidden, toggle];
}

/**
 * The points chart with sportbet's two interactions: pointing at (or
 * arrowing to) a game shows its tooltip, and a legend button hides a
 * player's line. The axis follows the lines that show.
 */
export function ChartInteraction({
  chart,
}: {
  chart: PointsChart;
}): JSX.Element {
  const [hidden, toggle] = useHiddenLines();
  const [active, setActive] = useState<number | null>(null);
  const games = chart.games.length;
  const showing = chart.lines.filter((line) => !hidden.has(line.player));
  const scale = chartScale(
    games,
    Math.max(0, ...showing.flatMap((line) => line.totalsCents)),
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const to = movedTo(event.key, active, games);
    if (to === null || games === 0) return;
    event.preventDefault();
    setActive(to);
  };

  return (
    <>
      <div className="overflow-x-auto p-2">
        <div
          role="group"
          aria-label="Taškų dinamika"
          tabIndex={0}
          onFocus={() => {
            if (games > 0) setActive(games - 1);
          }}
          onBlur={() => {
            setActive(null);
          }}
          onKeyDown={onKeyDown}
          className="relative min-w-[720px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChartSvg
            chart={chart}
            hidden={hidden}
            active={active}
            scale={scale}
            onActive={setActive}
          />
          {active === null ? null : (
            <Tooltip
              chart={chart}
              lines={showing}
              index={active}
              x={scale.x(active)}
            />
          )}
        </div>
      </div>
      <Legend lines={chart.lines} hidden={hidden} onToggle={toggle} />
    </>
  );
}
