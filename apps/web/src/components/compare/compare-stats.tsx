import type { JSX } from 'react';
import {
  compareStats,
  numberFormat,
  onePlace,
  type CompareStatKind,
  type Comparison,
  wholePoints,
} from '@sportbet/domain';
import { markClass } from './compare-marks';

interface StatLook {
  readonly label: string;
  readonly text: (value: number) => string;
}

const LOOKS: Readonly<Record<CompareStatKind, StatLook>> = {
  match: { label: 'Rungtynių taškai', text: onePlace },
  standings: { label: 'Eigos taškai', text: onePlace },
  survival: { label: 'Išlikimo taškai', text: wholePoints },
  serija: { label: 'Serija', text: onePlace },
  bingo: { label: 'Bingo', text: (bingo) => numberFormat(bingo, 0) },
};

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
  const stats = compareStats(me, them);
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
        {stats.map((stat) => {
          const { label, text } = LOOKS[stat.kind];
          return (
            <div key={stat.kind} data-testid="compare-stat" className={ROW}>
              <span
                className={`text-left font-semibold ${markClass(stat.meMark)}`}
              >
                {text(stat.me)}
              </span>
              <span className="text-center text-[0.78rem] text-muted">
                {label}
              </span>
              <span
                className={`text-right font-semibold ${markClass(stat.themMark)}`}
              >
                {text(stat.them)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
