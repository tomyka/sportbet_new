import type { JSX } from 'react';
import { markOf, onePlace, type Comparison } from '@sportbet/domain';
import { markClass } from './compare-marks';

/** .cmp-round-row: three columns, the sides' points round the round's name. */
const ROW =
  'grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 border-b border-border py-[5px] text-[0.85rem] last:border-b-0';

/**
 * compare/_card.blade.php's "Etapai": a row per round with a scored game,
 * each side's points to one decimal, the larger marked; nothing without a
 * round.
 */
export function CompareRounds({
  comparison,
}: {
  comparison: Comparison;
}): JSX.Element | null {
  const { me, them, rounds } = comparison;
  if (rounds.length === 0) return null;
  return (
    <>
      <div className="mb-2 text-[0.72rem] font-bold tracking-[0.07em] text-muted uppercase">
        Etapai
      </div>
      <div className="mb-4">
        <div
          data-testid="compare-rounds-header"
          className={`${ROW} pb-1.5 text-[0.72rem] font-bold text-muted`}
        >
          <span className="text-left">{me.username}</span>
          <span className="text-center text-[0.78rem] whitespace-nowrap">
            Etapas
          </span>
          <span className="text-right">{them.username}</span>
        </div>
        {rounds.map((round) => (
          <div key={round.round} data-testid="compare-round" className={ROW}>
            <span
              className={`text-left font-semibold ${markClass(markOf(round.meCents, round.themCents))}`}
            >
              {onePlace(round.meCents)}
            </span>
            <span className="text-center text-[0.78rem] whitespace-nowrap text-muted">
              {round.name}
            </span>
            <span
              className={`text-right font-semibold ${markClass(markOf(round.themCents, round.meCents))}`}
            >
              {onePlace(round.themCents)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
