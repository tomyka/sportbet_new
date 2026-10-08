import type { JSX } from 'react';
import type { DashboardMe } from '@sportbet/db';
import { onePlace } from '@sportbet/domain';
import type { ReactNode } from 'react';

/** .sb-tile, and .sb-tile--hi for the rank. */
function Tile({
  label,
  value,
  high = false,
  children,
}: {
  label: string;
  value: string;
  high?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid="tile"
      className={`flex flex-col gap-[2px] rounded-md px-[13px] py-[11px] ${high ? 'bg-accent-tint' : 'bg-surface-2'}`}
    >
      <span className="text-[0.74rem] tracking-[0.13em] text-muted uppercase">
        {label}
      </span>
      <span
        className={`text-[1.72rem] leading-[1.05] font-extrabold tabular-nums ${high ? 'text-accent' : ''}`}
      >
        {value}
      </span>
      {children}
    </div>
  );
}

/**
 * stat-tiles.blade.php (MainController::getSnapshotData): "vieta" with
 * "↑N per 5 žaid." when the rank moved (Ranking::change), "taškai" to one
 * decimal, "bingo" and "serija" (R-71), each "-" at zero. A player with
 * no scored row gets no tiles, as sportbet's snapshot is empty then.
 */
export function StatTiles({ me }: { me: DashboardMe }): JSX.Element | null {
  if (me.tiles === null) return null;
  const change = me.rankChange ?? 0;
  return (
    <div
      data-panel="tiles"
      className="grid grid-cols-2 gap-[10px] md:grid-cols-4"
    >
      <Tile label="vieta" value={`#${String(me.row.rank)}`} high>
        {change === 0 ? null : (
          <span
            className={`text-[0.74rem] tabular-nums ${change > 0 ? 'text-ok' : 'text-bad'}`}
          >
            {`${change > 0 ? '↑' : '↓'}${String(Math.abs(change))} per 5 žaid.`}
          </span>
        )}
      </Tile>
      <Tile label="taškai" value={onePlace(me.row.totalCents)} />
      <Tile
        label="bingo"
        value={me.tiles.bingo > 0 ? String(me.tiles.bingo) : '-'}
      />
      <Tile
        label="serija"
        value={me.tiles.serija > 0 ? String(me.tiles.serija) : '-'}
      />
    </div>
  );
}
