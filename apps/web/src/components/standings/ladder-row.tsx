'use client';

import type { DragEvent, JSX } from 'react';
import { ENTERED_FINAL_PLACES, type StandingsViewRow } from '@sportbet/domain';
import { TeamCrest } from '../hub/team-crest';
import type { LadderSession } from './ladder-session';

// One row of the standings ladder (standings.blade.php's .prediction-row):
// its cells, its arrows and boxes, and what the ladder hands it.

/** rank | team | arrows | 1/4 | 1/2 | final (.ps-group-row--ladder). */
export const GRID =
  'grid grid-cols-[30px_minmax(0,1fr)_46px_34px_34px_38px] items-center gap-[2px] px-1.5 py-[3px] max-[575px]:grid-cols-[24px_minmax(0,1fr)_46px_28px_28px_32px]';

const NUDGE =
  'h-6 w-[21px] rounded-[5px] border border-border bg-surface-2 p-0 text-[0.5rem] leading-none text-text focus-visible:border-accent focus-visible:shadow-[0_0_0_2px_var(--color-accent-tint)] focus-visible:outline-none disabled:cursor-default disabled:opacity-35 aria-disabled:cursor-default aria-disabled:opacity-35 enabled:not-aria-disabled:hover:border-accent enabled:not-aria-disabled:hover:text-accent';

const FINAL_BOX =
  'h-7 w-[38px] rounded-[6px] border border-border bg-surface-2 p-0 text-center text-[0.8rem] text-text [appearance:textfield] focus:border-accent focus:shadow-[0_0_0_2px_var(--color-accent-tint)] focus:outline-none disabled:bg-surface disabled:text-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const TICK = 'size-4 accent-accent disabled:opacity-50';

export type Arrow = 'up' | 'down';

/** A row's handlers for a mouse drag. */
export interface DragHandlers {
  readonly draggable: true;
  readonly onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragEnd: () => void;
}

/** The arrows by club and direction, and focus that follows the club, not the place (issue 142). */
export interface ArrowFocus {
  readonly arrowRef: (
    team: string,
    arrow: Arrow,
  ) => (button: HTMLButtonElement | null) => void;
  readonly focusAfter: (team: string, arrow: Arrow) => void;
}

/** The rank (the row's number once places are saved, else "-"), and the grip while the order can change. */
function RankCell({
  rank,
  reorderable,
}: {
  rank: string;
  reorderable: boolean;
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-[3px] select-none">
      <span
        data-testid="ladder-rank"
        className="min-w-[15px] text-right text-[0.82rem] font-bold text-accent tabular-nums"
      >
        {rank}
      </span>
      {reorderable ? (
        <span
          data-testid="ladder-grip"
          aria-hidden="true"
          className="text-[0.7rem] leading-none text-muted max-[575px]:hidden"
        >
          ⠿
        </span>
      ) : null}
    </div>
  );
}

/** ▲ and ▼, aria-disabled at the ends (never disabled while open, so focus stays on them). */
function Arrows({
  row,
  ends,
  reorderable,
  focus,
  onNudge,
}: {
  row: StandingsViewRow;
  ends: { readonly first: boolean; readonly last: boolean };
  reorderable: boolean;
  focus: ArrowFocus;
  onNudge: (arrow: Arrow) => void;
}): JSX.Element {
  return (
    <div className="flex justify-center gap-[2px]">
      {(['up', 'down'] as const).map((arrow) => (
        <button
          key={arrow}
          ref={focus.arrowRef(row.team, arrow)}
          type="button"
          aria-label={`${arrow === 'up' ? 'Pakelti' : 'Nuleisti'}: ${row.name}`}
          aria-disabled={arrow === 'up' ? ends.first : ends.last}
          disabled={!reorderable}
          onClick={() => {
            onNudge(arrow);
          }}
          className={NUDGE}
        >
          {arrow === 'up' ? '▲' : '▼'}
        </button>
      ))}
    </div>
  );
}

/** The two stage boxes and the final place box, each open as the view says. */
function Boxes({
  row,
  session,
}: {
  row: StandingsViewRow;
  session: LadderSession;
}): JSX.Element {
  return (
    <>
      {(['playOffs', 'finalFour'] as const).map((field) => (
        <div key={field} className="flex justify-center">
          <input
            type="checkbox"
            aria-label={`${field === 'playOffs' ? '1/4' : '1/2'}: ${row.name}`}
            checked={row[field] === true}
            disabled={!row.boxes[field]}
            onChange={(event) => {
              session.tick(row.team, field, event.target.checked);
            }}
            className={TICK}
          />
        </div>
      ))}
      <div className="flex justify-center">
        <input
          type="number"
          min={Math.min(...ENTERED_FINAL_PLACES)}
          max={Math.max(...ENTERED_FINAL_PLACES)}
          aria-label={`F: ${row.name}`}
          value={row.finalPlace ?? ''}
          disabled={!row.boxes.finalPlace}
          onChange={(event) => {
            session.finalPlace(row.team, event.target.value);
          }}
          className={FINAL_BOX}
        />
      </div>
    </>
  );
}

/** How one row is drawn and what it may do. */
export interface RowProps {
  readonly row: StandingsViewRow;
  readonly rank: string;
  readonly ends: { readonly first: boolean; readonly last: boolean };
  readonly reorderable: boolean;
  readonly message: string | null;
  /** Carried by a drag, or the row a drag is over. */
  readonly marked: { readonly dragged: boolean; readonly over: boolean };
  readonly drag: DragHandlers | null;
  readonly focus: ArrowFocus;
  readonly onNudge: (arrow: Arrow) => void;
  readonly session: LadderSession;
}

/** One club's row: rank, crest and name, the arrows, the boxes, and a refused save's message under it (R-59). */
export function LadderRowView(props: RowProps): JSX.Element {
  const { row, message, marked } = props;
  return (
    <div
      data-testid="ladder-row"
      data-team={row.team}
      data-name={row.name}
      {...props.drag}
      className={`text-[0.78rem] ${marked.dragged ? 'opacity-40' : ''} ${marked.over ? 'bg-accent-tint shadow-[inset_0_-2px_0_var(--color-accent)]' : ''}`}
    >
      <div className={GRID}>
        <RankCell rank={props.rank} reorderable={props.reorderable} />
        <div className="flex min-w-0 items-center gap-1">
          <TeamCrest team={row.name} size="line" />
          <span className="min-w-0 flex-1 truncate select-none">
            {row.name}
          </span>
        </div>
        <Arrows
          row={row}
          ends={props.ends}
          reorderable={props.reorderable}
          focus={props.focus}
          onNudge={props.onNudge}
        />
        <Boxes row={row} session={props.session} />
      </div>
      <div
        role="alert"
        hidden={message === null}
        className="px-1.5 pb-1.5 text-[0.72rem] font-semibold text-bad"
      >
        {message}
      </div>
    </div>
  );
}
