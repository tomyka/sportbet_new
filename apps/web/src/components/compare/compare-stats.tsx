import type { JSX } from 'react';
import {
  numberFormat,
  onePlace,
  type CompareSide,
  type Comparison,
} from '@sportbet/domain';
import { markOf } from './compare-marks';

/** Whole points as `number_format($x, 0)` prints them (survival's are whole). */
const whole = (cents: number): string =>
  numberFormat(Math.round(cents / 100), 0);

interface StatRow {
  readonly label: string;
  readonly of: (side: CompareSide) => number;
  readonly text: (value: number) => string;
  /** Left out while both sides are at 0 (survival, `hide_if_zero`). */
  readonly hiddenAtZero?: true;
}

const ROWS: readonly StatRow[] = [
  { label: 'Rungtynių taškai', of: (s) => s.matchCents, text: onePlace },
  { label: 'Eigos taškai', of: (s) => s.standingsCents, text: onePlace },
  {
    label: 'Išlikimo taškai',
    of: (s) => s.survivalCents,
    text: whole,
    hiddenAtZero: true,
  },
  { label: 'Serija', of: (s) => s.serijaCents, text: onePlace },
  {
    label: 'Bingo',
    of: (s) => s.bingo,
    text: (bingo) => numberFormat(bingo, 0),
  },
];

/** .cmp-stats-row: three columns, the sides' values round the label. */
const ROW =
  'grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 border-b border-border py-[5px] text-[0.85rem] last:border-b-0';

/**
 * compare/_card.blade.php's "Bendri statistikos": match points, standings
 * points, survival points (whole, only when either side has some), serija
 * and bingos, the larger side of each marked.
 */
export function CompareStats({
  comparison,
}: {
  comparison: Comparison;
}): JSX.Element {
  const { me, them } = comparison;
  const shown = ROWS.filter(
    (row) =>
      row.hiddenAtZero !== true || row.of(me) !== 0 || row.of(them) !== 0,
  );
  return (
    <>
      <div className="mb-2 text-[0.72rem] font-bold tracking-[0.07em] text-muted uppercase">
        Bendri statistikos
      </div>
      <div className="mb-5">
        <div
          data-testid="compare-stats-header"
          className={`${ROW} pb-1.5 text-[0.72rem] font-bold text-muted`}
        >
          <span className="text-left">{me.username}</span>
          <span />
          <span className="text-right">{them.username}</span>
        </div>
        {shown.map((row) => (
          <div key={row.label} data-testid="compare-stat" className={ROW}>
            <span
              className={`text-left font-semibold ${markOf(row.of(me), row.of(them))}`}
            >
              {row.text(row.of(me))}
            </span>
            <span className="text-center text-[0.78rem] text-muted">
              {row.label}
            </span>
            <span
              className={`text-right font-semibold ${markOf(row.of(them), row.of(me))}`}
            >
              {row.text(row.of(them))}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
