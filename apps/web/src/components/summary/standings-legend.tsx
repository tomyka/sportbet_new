import type { JSX } from 'react';
import type { StandingsVerdict } from '@sportbet/domain';
import { BADGE, VERDICT } from './standings-badge';

const COLOURS: readonly (readonly [StandingsVerdict, string])[] = [
  ['hit', 'Pataikyta'],
  ['miss', 'Praleista'],
  ['partial', 'Pusfinalis teisingas, finalo vieta ne'],
  ['pending', 'Laukiama'],
  ['none', 'Nespėta'],
];

/** Euroleague's stages: sportbet's G, QF, SF and F (its 1/16 and 1/8 are football's). */
const STAGES: readonly (readonly [string, string])[] = [
  ['G', 'Grupė'],
  ['QF', '1/4'],
  ['SF', '1/2'],
  ['F', 'Finalas'],
];

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
        {COLOURS.map(([verdict, label]) => (
          <span key={verdict} className="contents">
            <span
              data-testid="sst-badge"
              data-verdict={verdict}
              className={`${BADGE} ${VERDICT[verdict]}`}
            >
              2
            </span>
            {label}
          </span>
        ))}
      </div>
      <div
        data-testid="sst-legend-stages"
        className="flex flex-wrap items-center gap-1"
      >
        {STAGES.map(([letters, name]) => (
          <span key={letters} className="contents">
            <span className="mr-0.5 inline-block rounded-[3px] bg-border px-1 py-px text-[0.6rem] font-bold text-muted">
              {letters}
            </span>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
