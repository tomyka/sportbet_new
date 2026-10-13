import type { JSX } from 'react';
import { onePlace, type SummaryCell } from '@sportbet/domain';
import { HoverPop } from './hover-pop';
import { PopRow } from './pop-row';

type Points = NonNullable<SummaryCell['points']>;

/** "+" before a positive serija, as sportbet prints it. */
const serijaText = (cents: number): string =>
  `${cents > 0 ? '+' : ''}${onePlace(cents)}`;

/**
 * The results summary's .sr-pts-link: a scored prediction's points
 * (match + serija, one decimal) and on hover or focus the popover of its
 * parts.
 */
export function PointsPopover({ points }: { points: Points }): JSX.Element {
  return (
    <HoverPop
      testId="sr-points"
      className="mb-1 block text-[0.9rem] leading-[1.2] font-extrabold text-text hover:text-accent"
      content={
        <div className="min-w-40">
          <PopRow label="Nugalėtojas" value={onePlace(points.winnerCents)} />
          <PopRow label="Skirtumas" value={onePlace(points.marginCents)} />
          <PopRow label="Tikslus" value={onePlace(points.bingoCents)} />
          <PopRow label="Serija" value={serijaText(points.serijaCents)} />
        </div>
      }
    >
      {onePlace(points.totalCents)}
    </HoverPop>
  );
}
