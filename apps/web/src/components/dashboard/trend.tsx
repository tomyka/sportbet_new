import { onePlace, type HistoryEntry } from '@sportbet/domain';
import { Icon } from '../shell/icon';

/** How many of the latest games the panel shows (PointController's history). */
const SHOWN = 6;

/** A coordinate in tenths as PHP echoes `round($x, 1)`: "60", "33.3". */
function tenths(value: number): string {
  const rest = value % 10;
  return rest === 0
    ? String(Math.floor(value / 10))
    : `${String(Math.floor(value / 10))}.${String(rest)}`;
}

/** A dot's place on the chart, in tenths of the SVG's units. */
interface Dot {
  readonly x: number;
  readonly y: number;
  readonly label: number;
}

/**
 * The chart's dots as points.blade.php places them: spread over at least
 * 120 units, 60 a game, the best rank of the six at the top (y 10) and the
 * worst at the bottom (y 70), one game in the middle.
 */
function dotsOf(entries: readonly HistoryEntry[], width: number): Dot[] {
  const count = entries.length;
  const worst = Math.max(...entries.map((entry) => entry.rank), 1);
  return entries.map((entry, index) => ({
    x:
      count > 1
        ? Math.round((index * width * 10) / (count - 1))
        : (width * 10) / 2,
    y:
      worst > 1
        ? 100 + Math.round(((entry.rank - 1) * 600) / (worst - 1))
        : 100,
    label: index + 1,
  }));
}

function RankCell({ rank, before }: { rank: number; before: number | null }) {
  const move = before === null ? 0 : before - rank;
  const tone =
    move > 0
      ? 'font-semibold text-ok'
      : move < 0
        ? 'font-semibold text-bad'
        : '';
  return (
    <span data-testid="trend-rank" className={`text-right ${tone}`}>
      {`#${String(rank)}`}
      {move > 0 ? (
        <>
          {' '}
          <Icon name="caret-up-fill" />
        </>
      ) : null}
      {move < 0 ? (
        <>
          {' '}
          <Icon name="caret-down-fill" />
        </>
      ) : null}
    </span>
  );
}

/**
 * points.blade.php's trend panel under an opened row: "Paskutinės 6
 * rungtynės" as a rank line, and the "#", "+ Tšk", "Vieta" table, each
 * game against the one before ▲/▼ (here the caret icons).
 */
export function Trend({ history }: { history: readonly HistoryEntry[] }) {
  const entries = history.slice(-SHOWN);
  const width = Math.max(120, (entries.length - 1) * 60);
  const dots = dotsOf(entries, width);
  return (
    <div className="flex items-start gap-[14px] border-b border-border pt-[10px] pb-[6px]">
      <div className="min-w-0 flex-[2]">
        <div className="mb-1 text-[0.65rem] text-muted">
          Paskutinės 6 rungtynės
        </div>
        <svg
          data-testid="trend-chart"
          viewBox={`0 0 ${String(width)} 90`}
          className="block h-[90px] w-full"
          aria-hidden="true"
        >
          <line
            className="stroke-border stroke-[0.5]"
            x1="0"
            y1="80"
            x2={width}
            y2="80"
          />
          {[55, 30].map((y) => (
            <line
              key={y}
              className="stroke-border stroke-[0.5] [stroke-dasharray:3_3]"
              x1="0"
              y1={y}
              x2={width}
              y2={y}
            />
          ))}
          {dots.length > 1 ? (
            <polyline
              className="fill-none stroke-warn stroke-2 [stroke-linejoin:round]"
              points={dots
                .map((dot) => `${tenths(dot.x)},${tenths(dot.y)}`)
                .join(' ')}
            />
          ) : null}
          {dots.map((dot, index) => {
            const last = index === dots.length - 1;
            return (
              <circle
                key={dot.label}
                className={
                  last ? 'fill-warn stroke-card stroke-[1.5]' : 'fill-warn'
                }
                cx={tenths(dot.x)}
                cy={tenths(dot.y)}
                r={last ? 4 : 3}
              />
            );
          })}
          {dots.map((dot) => (
            <text
              key={dot.label}
              className="fill-muted text-[8px]"
              x={tenths(dot.x)}
              y="89"
              textAnchor="middle"
            >
              {dot.label}
            </text>
          ))}
        </svg>
        <div className="mt-[3px] flex gap-[10px] text-[0.6rem] text-warn">
          -- vieta
        </div>
      </div>
      <div className="min-w-[110px] flex-1 border-l border-border pl-3">
        <div
          data-testid="trend-header"
          className="mb-1 flex justify-between text-[0.65rem] font-semibold text-muted"
        >
          <span>#</span>
          <span>+ Tšk</span>
          <span>Vieta</span>
        </div>
        {entries.map((entry, index) => (
          <div
            key={entry.game}
            data-testid="trend-row"
            className="flex justify-between gap-1 py-[2px] text-[0.68rem]"
          >
            <span data-testid="trend-index" className="w-6 text-muted">
              {index + 1}
            </span>
            <span>{`+${onePlace(entry.gainedCents)}`}</span>
            <RankCell
              rank={entry.rank}
              before={index > 0 ? (entries[index - 1]?.rank ?? null) : null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
