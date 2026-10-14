import type { JSX } from 'react';
import { numberFormat, type SummaryCell } from '@sportbet/domain';
import { HoverPop } from './hover-pop';
import { PopRow } from './pop-row';

type Points = NonNullable<SummaryCell['points']>;

/** "+" before a positive serija, as sportbet prints it. */
const serijaText = (tenths: number): string =>
  `${tenths > 0 ? '+' : ''}${numberFormat(tenths, 1)}`;

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
          <PopRow
            label="Nugalėtojas"
            value={numberFormat(points.winnerTenths, 1)}
          />
          <PopRow
            label="Skirtumas"
            value={numberFormat(points.marginTenths, 1)}
          />
          <PopRow label="Tikslus" value={numberFormat(points.bingoTenths, 1)} />
          <PopRow label="Serija" value={serijaText(points.serijaTenths)} />
        </div>
      }
    >
      {numberFormat(points.totalTenths, 1)}
    </HoverPop>
  );
}
