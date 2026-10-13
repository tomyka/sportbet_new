import type { JSX } from 'react';
import { onePlace, type CompareSide, type Comparison } from '@sportbet/domain';
import { markOf } from './compare-marks';

/** .cmp-player: a side's rank, username and total, the total marked against the other's. */
function Player({
  side,
  other,
  align,
  testId,
}: {
  side: CompareSide;
  other: CompareSide;
  align: 'left' | 'right';
  testId: string;
}): JSX.Element {
  return (
    <div
      data-testid={testId}
      className={`flex flex-1 flex-col gap-0.5 ${align === 'left' ? 'items-start text-left' : 'items-end text-right'}`}
    >
      <div className="text-[0.72rem] font-semibold text-muted">{`#${String(side.rank)}`}</div>
      <div className="text-[0.95rem] font-bold break-words text-text">
        {side.username}
      </div>
      <div
        data-testid="compare-total"
        className={`text-2xl leading-[1.1] font-extrabold ${markOf(side.totalCents, other.totalCents) || 'text-text'}`}
      >
        {onePlace(side.totalCents)}
      </div>
    </div>
  );
}

/** .cmp-record: the viewer's rounds won, drawn and lost. */
function Record({
  record,
}: {
  record: NonNullable<Comparison['record']>;
}): JSX.Element {
  return (
    <div
      data-testid="compare-record"
      className="flex gap-1 text-[0.72rem] font-bold"
    >
      <span className="text-ok">{`${String(record.wins)}W`}</span>
      <span className="text-muted">{`${String(record.draws)}D`}</span>
      <span className="text-bad">{`${String(record.losses)}L`}</span>
    </div>
  );
}

/**
 * compare/_card.blade.php's header: each side's rank, username and total
 * (the larger the winner), "vs" between them, and the round record when
 * there is a round.
 */
export function CompareHeader({
  comparison,
}: {
  comparison: Comparison;
}): JSX.Element {
  const { me, them, record } = comparison;
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-border pt-1 pb-4">
      <Player side={me} other={them} align="left" testId="compare-me" />
      <div className="flex flex-none flex-col items-center gap-1.5">
        <span className="text-[0.7rem] font-bold tracking-[0.08em] text-muted uppercase">
          vs
        </span>
        {record === null ? null : <Record record={record} />}
      </div>
      <Player side={them} other={me} align="right" testId="compare-them" />
    </div>
  );
}
