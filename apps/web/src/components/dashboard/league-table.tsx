'use client';

import type { JSX } from 'react';
import type {
  LeagueTable as LeagueTableData,
  LeagueTableRow,
  StageCents,
} from '@sportbet/db';
import { onePlace, type PlayerId } from '@sportbet/domain';
import { Fragment, useState, type ReactNode } from 'react';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon, type IconName } from '../shell/icon';
import { Trend } from './trend';

/** How many rows show before "Rodyti visus" ($lbLimit). */
const LIMIT = 10;

/**
 * The standings popover's lines, by Euroleague's stage names (R-76; sportbet
 * prints football's).
 */
const STAGES: readonly (readonly [keyof StageCents, string])[] = [
  ['place', 'Reguliarus sezonas'],
  ['playOffs', 'Atkrintamosios'],
  ['finalFour', 'Finalo ketvertas'],
  ['final', 'Finalas'],
];

/** .lb-header-sub / .lb-sub-col: a fixed track, shown from md up (d-none d-md-block). */
const SUB = 'hidden w-14 shrink-0 items-center justify-end md:flex';

const SUB_HEADERS: readonly {
  readonly title: string;
  readonly icon: IconName;
  readonly survival?: true;
}[] = [
  { title: 'Rezultatų spėjimo taškai', icon: 'check2-all' },
  { title: 'Eigos spėjimo taškai', icon: 'bar-chart-steps' },
  { title: 'Išlikimo taškai', icon: 'shield-check', survival: true },
  { title: 'Sekos taškai', icon: 'fire' },
  { title: 'Bingo taškai', icon: 'bullseye' },
];

/** PHP's echo of the float survival sum ("3", "1.5"), as sportbet prints the column. */
const survivalText = (cents: number): string => String(cents / 100);

/** .lb-header */
function Header({ survival }: { survival: boolean }) {
  return (
    <div className="mb-[2px] flex items-center gap-[10px] border-b-2 border-border pb-[6px] text-[0.65rem] font-bold tracking-[0.4px] text-muted uppercase">
      <span className="w-[26px] shrink-0 text-center">#</span>
      <span className="flex-1">Žaidėjas</span>
      {SUB_HEADERS.filter((sub) => survival || sub.survival !== true).map(
        (sub) => (
          <span key={sub.title} title={sub.title} className={SUB}>
            <Icon name={sub.icon} />
          </span>
        ),
      )}
      <span className="w-[72px] shrink-0 text-right font-bold">Taškai</span>
      <span className="w-3 shrink-0" />
    </div>
  );
}

/**
 * The standings cell: its total, and on hover or focus the .sr-pop of the
 * stages above 0; a cell with none opens nothing.
 */
function StandingsCell({ row }: { row: LeagueTableRow }) {
  const [open, setOpen] = useState(false);
  const stages = STAGES.filter(([stage]) => row.stages[stage] > 0);
  const pops = stages.length > 0;
  return (
    <div
      tabIndex={pops ? 0 : undefined}
      onMouseEnter={() => {
        setOpen(pops);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(pops);
      }}
      onBlur={() => {
        setOpen(false);
      }}
      onClick={(event) => {
        // Hovering the cell is not a click on the row.
        if (pops) event.stopPropagation();
      }}
      className={`relative ${SUB} ${pops ? 'cursor-help' : ''}`}
    >
      <span data-testid="lb-standings">{onePlace(row.standingsCents)}</span>
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-[6px] border border-border bg-card p-2 text-left text-[0.72rem] font-normal whitespace-nowrap text-text shadow-[0_2px_8px_var(--color-shadow-strong)]"
        >
          {stages.map(([stage, label]) => (
            <span key={stage} className="flex justify-between gap-4 py-[2px]">
              <span className="text-muted">{label}</span>
              <strong className="font-bold">
                {onePlace(row.stages[stage])}
              </strong>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** A row that opens its trend: open or not, and the props that make it a button (Enter and Space too). */
function useExpandable(expandable: boolean): {
  readonly open: boolean;
  readonly control: Record<string, unknown>;
} {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    setOpen((was) => !was);
  };
  const control = expandable
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-expanded': open,
        onClick: toggle,
        onKeyDown: (event: { key: string; preventDefault(): void }) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        },
      }
    : {};
  return { open, control };
}

/** The row's look: the player's own highlighted, others striped; a rule under all but a closed last row. */
function entryLook(row: {
  readonly isMe: boolean;
  readonly striped: boolean;
  readonly ruled: boolean;
  readonly expandable: boolean;
}): string {
  const look = row.isMe
    ? '-mx-2 rounded-[6px] border-l-[3px] border-l-accent bg-accent-tint px-2 py-[5px]'
    : `py-1 ${row.striped ? 'bg-surface-2' : ''}`;
  return `flex items-center gap-[10px] ${row.ruled ? 'border-b border-border' : ''} ${look} ${row.expandable ? 'cursor-pointer hover:bg-accent-tint' : ''}`;
}

/** The points columns between the name and the total: results, standings, survival (when played), serija, bingo. */
function PointsCols({
  row,
  survival,
}: {
  row: LeagueTableRow;
  survival: boolean;
}): JSX.Element {
  const serija = row.serijaCents > 0;
  const bingo = row.bingo > 0;
  return (
    <>
      <SubCol>{onePlace(row.matchCents)}</SubCol>
      <StandingsCell row={row} />
      {survival ? <SubCol>{survivalText(row.survivalCents)}</SubCol> : null}
      <SubCol strong={serija ? 'text-accent' : undefined}>
        {serija ? `+${onePlace(row.serijaCents)}` : '-'}
      </SubCol>
      <SubCol strong={bingo ? 'text-text' : undefined}>
        <span data-testid="lb-bingo">
          {bingo ? (
            <>
              <Icon name="star-fill" />
              {String(row.bingo)}
            </>
          ) : null}
        </span>
      </SubCol>
    </>
  );
}

/** One .lb-entry: the row, and its trend once opened. */
function Entry({
  row,
  survival,
  isMe,
  striped,
  last,
}: {
  row: LeagueTableRow;
  survival: boolean;
  isMe: boolean;
  striped: boolean;
  last: boolean;
}): JSX.Element {
  const expandable = row.history.length > 0;
  const { open, control } = useExpandable(expandable);
  return (
    <div>
      <div
        data-testid="lb-row"
        data-me={isMe ? 'true' : undefined}
        {...control}
        className={entryLook({
          isMe,
          striped,
          ruled: !last || open,
          expandable,
        })}
      >
        <div
          className={`flex w-[26px] shrink-0 items-center justify-center text-[0.75rem] tabular-nums ${row.rank <= 3 ? 'font-bold text-text' : 'font-medium text-muted'}`}
        >
          {String(row.rank)}
        </div>
        <div
          className={`min-w-0 flex-1 truncate text-[0.875rem] ${isMe ? 'font-bold text-accent' : 'font-medium text-text'}`}
        >
          {row.username}
        </div>
        <PointsCols row={row} survival={survival} />
        <div
          className={`w-[72px] shrink-0 text-right text-[0.9rem] font-bold tabular-nums ${isMe ? 'text-accent' : 'text-text'}`}
        >
          {onePlace(row.totalCents)}
        </div>
        <span className="w-3 shrink-0 text-center text-[0.7rem] text-muted">
          {expandable ? (
            <Icon name={open ? 'caret-down-fill' : 'caret-right-fill'} />
          ) : null}
        </span>
      </div>
      {open ? <Trend history={row.history} /> : null}
    </div>
  );
}

/** .lb-sub-col; `strong` is .lb-sub-streak's or .lb-sub-bingo's colour. */
function SubCol({
  strong,
  children,
}: {
  strong?: 'text-accent' | 'text-text' | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={`${SUB} text-[0.72rem] tabular-nums ${strong === undefined ? 'font-medium text-muted' : `font-bold ${strong}`}`}
    >
      {children}
    </div>
  );
}

/**
 * partials/points.blade.php's "Taškų lentelė" (PointController::
 * getAllUserPoints): the listed players in the table's order (R-73), each
 * row's rank, name (plain text until slice 11's compare page), its parts
 * from md up - result points, the standings with their stages on hover,
 * survival when the tournament plays it, serija, bingo - and the total.
 * The top ten show, then "···" and the viewer's own row if it is below
 * them, and "Rodyti visus (N)" / "Rodyti mažiau". A row with a history
 * opens its Trend. `me` is null where no row is the viewer's (the
 * tournament page).
 */
export function LeagueTable({
  table,
  me,
}: {
  table: LeagueTableData;
  me: PlayerId | null;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const shown = table.rows.flatMap((row, index) => {
    const position = index + 1;
    const isMe = row.player === me;
    return expanded || position <= LIMIT || isMe
      ? [{ row, position, isMe }]
      : [];
  });
  return (
    <div data-panel="league-table" className={CARD}>
      <div className={`mb-3 ${CARD_TITLE}`}>
        <CardIcon name="trophy-fill" /> Taškų lentelė
      </div>
      <Header survival={table.survival} />
      {shown.map(({ row, position, isMe }, index) => (
        <Fragment key={row.player}>
          {isMe && position > LIMIT && !expanded ? (
            <div className="border-b border-border py-[3px] text-center text-[0.65rem] tracking-[4px] text-muted opacity-50">
              ···
            </div>
          ) : null}
          <Entry
            row={row}
            survival={table.survival}
            isMe={isMe}
            striped={position % 2 === 0}
            last={index === shown.length - 1}
          />
        </Fragment>
      ))}
      {table.rows.length > LIMIT ? (
        <button
          type="button"
          onClick={() => {
            setExpanded((was) => !was);
          }}
          className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-border bg-transparent pt-2 text-[0.68rem] font-bold tracking-[0.4px] text-muted uppercase hover:text-accent"
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
          {expanded
            ? 'Rodyti mažiau'
            : `Rodyti visus (${String(table.rows.length)})`}
        </button>
      ) : null}
    </div>
  );
}
