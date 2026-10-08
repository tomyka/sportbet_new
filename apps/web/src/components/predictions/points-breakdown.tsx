'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { Icon } from '../shell/icon';

/** A scored row's points as the page prints them, one decimal each (onePlace). */
export interface LinePointsText {
  readonly total: string;
  readonly winner: string;
  readonly margin: string;
  readonly bingo: string;
  /** Null when the row earned no serija. */
  readonly serija: string | null;
}

/**
 * .upcoming-pts: the row's total (full points + serija) in the accent
 * colour, its serija under it with sportbet's flame; on hover, the
 * .sr-pop breakdown - Nugalėtojas, Skirtumas, Tikslus, and Serija when
 * there is one. A row that earned nothing prints 0.0 in transparent ink
 * (.upt-empty) and opens nothing.
 */
export function PointsBreakdown({
  points,
}: {
  points: LinePointsText | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const scored = points !== null;
  return (
    <span
      data-testid="line-points"
      tabIndex={scored ? 0 : undefined}
      onMouseEnter={() => {
        setOpen(scored);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(scored);
      }}
      onBlur={() => {
        setOpen(false);
      }}
      className={`relative flex min-w-9 shrink-0 flex-col items-end text-right text-[0.78rem] font-bold ${scored ? 'text-accent' : 'text-transparent'}`}
    >
      {points?.total ?? '0.0'}
      {points === null ? null : <SerijaUnder serija={points.serija} />}
      {open && points !== null ? <Breakdown points={points} /> : null}
    </span>
  );
}

/** The serija under the total, with sportbet's flame, when the row earned one. */
function SerijaUnder({
  serija,
}: {
  serija: string | null;
}): JSX.Element | null {
  return serija === null ? null : (
    <span className="text-[0.62rem] leading-none font-bold text-accent">
      <Icon name="fire" />+{serija}
    </span>
  );
}

/** .sr-pop: Nugalėtojas, Skirtumas, Tikslus, and Serija when there is one. */
function Breakdown({ points }: { points: LinePointsText }): JSX.Element {
  return (
    <span
      role="tooltip"
      className="absolute top-1/2 right-full z-10 mr-2 min-w-[160px] -translate-y-1/2 rounded-[6px] border border-border bg-card p-2 text-left text-[0.78rem] font-normal text-text shadow-[0_2px_8px_var(--color-shadow-strong)]"
    >
      <BreakdownRow label="Nugalėtojas" value={points.winner} />
      <BreakdownRow label="Skirtumas" value={points.margin} />
      <BreakdownRow label="Tikslus" value={points.bingo} />
      {points.serija === null ? null : (
        <BreakdownRow label="Serija" value={`+${points.serija}`} />
      )}
    </span>
  );
}

/** .sr-pop-row */
function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-[2px]">
      <span className="text-muted">{label}</span>
      <strong className="font-bold">{value}</strong>
    </div>
  );
}
