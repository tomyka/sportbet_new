import type { JSX } from 'react';
import {
  numberFormat,
  type PointsBreakdown,
  type StandingsBadge,
  type StandingsLineKey,
  type StandingsVerdict,
} from '@sportbet/domain';
import { HoverPop } from './hover-pop';
import { PopRow } from './pop-row';
import { STAGE_LABELS } from './stage-labels';

/**
 * .sst-hit, -miss, -partial, -pending and -none: each verdict's colours, on
 * sportbet's tokens, and what the legend says it means. The badge and the
 * legend both read this one table.
 */
export const VERDICT: Readonly<
  Record<StandingsVerdict, { readonly look: string; readonly legend: string }>
> = {
  hit: { look: 'bg-ok-tint text-ok', legend: 'Pataikyta' },
  miss: { look: 'bg-bad-tint text-bad', legend: 'Praleista' },
  partial: {
    look: 'bg-warn-tint text-warn',
    legend: 'Pusfinalis teisingas, finalo vieta ne',
  },
  pending: { look: 'bg-warn-tint text-warn', legend: 'Laukiama' },
  none: { look: 'bg-surface-2 text-dim', legend: 'Nespėta' },
};

/** The verdicts in the legend's order. */
export const VERDICT_ORDER: readonly StandingsVerdict[] = [
  'hit',
  'miss',
  'partial',
  'pending',
  'none',
];

/** .sst-badge: an 18px square. */
export const BADGE =
  'inline-flex size-[18px] flex-none items-center justify-center rounded-[4px] text-[0.62rem] leading-none font-bold';

/**
 * A stage's points with, when the crowd bonus applied, what they were made
 * from: "Spėjimo taškai" and "Koeficientas" under the line (.sr-pop-sub).
 */
export function BreakdownRows({
  label,
  breakdown,
}: {
  label: string;
  breakdown: PointsBreakdown;
}): JSX.Element {
  return (
    <>
      <PopRow label={label} value={numberFormat(breakdown.pointsTenths, 1)} />
      {breakdown.base === null || breakdown.multiplier === null ? null : (
        <>
          <PopRow label="Spėjimo taškai" value={breakdown.base} sub />
          <PopRow label="Koeficientas" value={`×${breakdown.multiplier}`} sub />
        </>
      )}
    </>
  );
}

/**
 * One of a cell's four badges: its symbol in its verdict's colours, and
 * either the popover of its points (hover or focus) or, with none, a title.
 */
export function StandingsBadgeView({
  stage,
  badge,
}: {
  stage: StandingsLineKey;
  badge: StandingsBadge;
}): JSX.Element {
  const look = `${BADGE} ${VERDICT[badge.verdict].look}`;
  if (badge.popover === null) {
    return (
      <span
        data-testid="sst-badge"
        data-stage={stage}
        data-verdict={badge.verdict}
        title={STAGE_LABELS[stage].title(badge.shown)}
        className={look}
      >
        {badge.shown}
      </span>
    );
  }
  return (
    <HoverPop
      testId="sst-badge"
      className={look}
      content={
        <div className="text-[0.72rem]">
          <BreakdownRows
            label={STAGE_LABELS[stage].popover}
            breakdown={badge.popover}
          />
        </div>
      }
      data={{ 'data-stage': stage, 'data-verdict': badge.verdict }}
    >
      {badge.shown}
    </HoverPop>
  );
}
