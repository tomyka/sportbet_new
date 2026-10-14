import type { JSX } from 'react';
import { STANDINGS_LINE_KEYS } from '@sportbet/domain';
import { BADGE, VERDICT, VERDICT_ORDER } from './standings-badge';
import { STAGE_LABELS } from './stage-labels';

/** .sst-legend: what the five colours and the four stage letters mean. */
export function StandingsLegend(): JSX.Element {
  return (
    <div
      data-testid="sst-legend"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-surface-2 px-4 py-2.5 text-[0.72rem] text-muted"
    >
      <div
        data-testid="sst-legend-colors"
        className="flex flex-wrap items-center gap-1.5"
      >
        {VERDICT_ORDER.map((verdict) => (
          <span key={verdict} className="contents">
            <span
              data-testid="sst-badge"
              data-verdict={verdict}
              className={`${BADGE} ${VERDICT[verdict].look}`}
            >
              2
            </span>
            {VERDICT[verdict].legend}
          </span>
        ))}
      </div>
      <div
        data-testid="sst-legend-stages"
        className="flex flex-wrap items-center gap-1"
      >
        {STANDINGS_LINE_KEYS.map((stage) => (
          <span key={stage} className="contents">
            <span className="mr-0.5 inline-block rounded-[3px] bg-border px-1 py-px text-[0.6rem] font-bold text-muted">
              {STAGE_LABELS[stage].letters}
            </span>
            {STAGE_LABELS[stage].legend}
          </span>
        ))}
      </div>
    </div>
  );
}
