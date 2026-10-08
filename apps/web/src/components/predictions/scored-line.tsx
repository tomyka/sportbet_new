import type { JSX } from 'react';
import { TeamCrest } from '../hub/team-crest';
import { PointsBreakdown, type LinePointsText } from './points-breakdown';

/** A finished game's row, in strings. */
export interface ScoredLineText {
  readonly game: number;
  readonly time: string;
  readonly home: string;
  readonly away: string;
  /** "88:79" */
  readonly result: string;
  /** "85:80", with "?" for a blank side. */
  readonly predicted: string;
  readonly points: LinePointsText | null;
}

const TEAM_NAME =
  'hidden truncate text-[0.82rem] font-medium whitespace-nowrap md:inline';

/**
 * A finished game, as sportbet's results page draws it - the same row as
 * "Artimiausios rungtynės" (.upcoming-row): the time, the crests (names from
 * md), the result over the prediction, and the points.
 */
export function ScoredLine({ line }: { line: ScoredLineText }): JSX.Element {
  return (
    <div
      data-testid="scored-line"
      className="grid grid-cols-[52px_1fr_auto_1fr_auto] items-center gap-1.5 rounded-[6px] border-b border-border py-[7px] text-text last:border-b-0 hover:bg-surface-2"
    >
      <span className="text-[0.72rem] leading-[1.3] whitespace-nowrap text-muted">
        {line.time}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <TeamCrest team={line.home} size="line" />
        <span className={TEAM_NAME}>{line.home}</span>
      </span>
      <span className="flex min-w-[72px] items-center justify-center gap-[3px] whitespace-nowrap">
        <span className="text-[0.82rem] font-bold text-text">
          {line.result}
        </span>
        <span className="text-[0.72rem] text-muted">/</span>
        <span className="text-[0.78rem] text-muted">{line.predicted}</span>
      </span>
      <span className="flex min-w-0 items-center justify-start gap-1.5">
        <span className={TEAM_NAME}>{line.away}</span>
        <TeamCrest team={line.away} size="line" />
      </span>
      <PointsBreakdown points={line.points} />
    </div>
  );
}
