import type { JSX } from 'react';
import {
  onePlace,
  type PointsBreakdown,
  type StandingsBadge,
  type StandingsLineKey,
  type StandingsVerdict,
} from '@sportbet/domain';
import { HoverPop } from './hover-pop';
import { PopRow } from './pop-row';

/** .sst-hit, -miss, -partial, -pending and -none, on sportbet's tokens. */
export const VERDICT: Readonly<Record<StandingsVerdict, string>> = {
  hit: 'bg-ok-tint text-ok',
  miss: 'bg-bad-tint text-bad',
  partial: 'bg-warn-tint text-warn',
  pending: 'bg-warn-tint text-warn',
  none: 'bg-surface-2 text-dim',
};

/** .sst-badge: an 18px square. */
export const BADGE =
  'inline-flex size-[18px] flex-none items-center justify-center rounded-[4px] text-[0.62rem] leading-none font-bold';

/** A badge popover's heading, sportbet's `sstBadgePopover` labels. */
const POPOVER_LABEL: Readonly<Record<StandingsLineKey, string>> = {
  place: 'Grupės vieta',
  playOffs: 'Ketvirtfinalis',
  finalFour: 'Pusfinalis',
  final: 'Finalas',
};

/** The title of a badge that has no popover: the place and the final say what was predicted, the ticks name their stage. */
const TITLE: Readonly<Record<StandingsLineKey, (shown: string) => string>> = {
  place: (shown) => `Grupės vieta: spėta ${shown}`,
  playOffs: () => '1/4',
  finalFour: () => '1/2',
  final: (shown) => `Finalas: spėta ${shown}`,
};

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
      <PopRow label={label} value={onePlace(breakdown.pointsCents)} />
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
  const look = `${BADGE} ${VERDICT[badge.verdict]}`;
  if (badge.popover === null) {
    return (
      <span
        data-testid="sst-badge"
        data-stage={stage}
        data-verdict={badge.verdict}
        title={TITLE[stage](badge.shown)}
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
            label={POPOVER_LABEL[stage]}
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
