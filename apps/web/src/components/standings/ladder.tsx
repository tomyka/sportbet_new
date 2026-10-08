'use client';

import {
  afterTick,
  ENTERED_FINAL_PLACES,
  finalPlaceOpen,
  isEnteredFinalPlace,
  keptChain,
  standingsCounts,
  tickOpen,
  type EnteredFinalPlace,
  type LadderRow,
  type StandingsPage,
  type StandingsStage,
} from '@sportbet/domain';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TeamCrest } from '../hub/team-crest';
import { announcement, moved } from './ladder-moves';
import { saveQueue } from './save-queue';
import { postStandingsOrder, postStandingsRow } from './standings-answer';
import { useTouchDrag } from './use-touch-drag';

/** How long after the last arrow press the order is posted, so a run of presses is one save. */
export const REORDER_DELAY_MS = 400;

/** psAnnounce: cleared first and written a beat later, so a repeat is still read. */
const ANNOUNCE_DELAY_MS = 50;

/** .ps-ladder-error: how long a refused order's red ring stays. */
const ERROR_RING_MS = 1500;

const REFUSED_ORDER = 'Tvarkos išsaugoti nepavyko, grąžinta ankstesnė.';

const UNSAVED =
  'Lentelė dar neišsaugota. Perkelkite komandą arba išsaugokite tvarką, kokią matote.';

/** rank | team | arrows | 1/4 | 1/2 | final (.ps-group-row--ladder). */
const GRID =
  'grid grid-cols-[30px_minmax(0,1fr)_46px_34px_34px_38px] items-center gap-[2px] px-1.5 py-[3px] max-[575px]:grid-cols-[24px_minmax(0,1fr)_46px_28px_28px_32px]';

const NUDGE =
  'h-6 w-[21px] rounded-[5px] border border-border bg-surface-2 p-0 text-[0.5rem] leading-none text-text focus-visible:border-accent focus-visible:shadow-[0_0_0_2px_var(--color-accent-tint)] focus-visible:outline-none disabled:cursor-default disabled:opacity-35 aria-disabled:cursor-default aria-disabled:opacity-35 enabled:not-aria-disabled:hover:border-accent enabled:not-aria-disabled:hover:text-accent';

const FINAL_BOX =
  'h-7 w-[38px] rounded-[6px] border border-border bg-surface-2 p-0 text-center text-[0.8rem] text-text [appearance:textfield] focus:border-accent focus:shadow-[0_0_0_2px_var(--color-accent-tint)] focus:outline-none disabled:bg-surface disabled:text-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const TICK = 'size-4 accent-accent disabled:opacity-50';

type Arrow = 'up' | 'down';

/** The places a row posts: each team's as last saved (a row never posts a place a reorder in flight may change). */
type SavedPlaces = ReadonlyMap<string, number | null>;

const placesOf = (rows: readonly LadderRow[]): SavedPlaces =>
  new Map(rows.map((row) => [row.team, row.place]));

/**
 * A row's final place as posted. Only 1 or 2 can be: a stored 3 or 4 stays
 * only on a row ticked for both stages (keptChain clears it elsewhere on
 * load), where every change clears it (unticking a stage) or sets it from
 * the box, which takes 1, 2 or nothing.
 */
function enteredFinalPlace(row: LadderRow): EnteredFinalPlace | null {
  const place = row.finalPlace;
  if (place === null || isEnteredFinalPlace(place)) return place;
  throw new Error(
    `ladder: a stored final place ${String(place)} reached a post`,
  );
}

/** A counter badge (#ps-progress): green once exactly full, red otherwise. */
function Counter({
  label,
  have,
  want,
}: {
  label: string;
  have: number;
  want: number;
}) {
  return (
    <span
      className={`rounded-[6px] px-2 py-0.5 text-[0.75rem] font-bold text-on-state ${have === want ? 'bg-ok' : 'bg-bad'}`}
    >
      {label}: {have} / {want}
    </span>
  );
}

/**
 * standings.blade.php's ladder (issue 139), the Euroleague's one table:
 * the rows in the order they are shown, which is the prediction. A move -
 * an arrow, a mouse drag or a long-press touch drag - is announced in the
 * live region and saved as one whole order (a reorder; arrows once the
 * presses pause); a refused order puts the last saved one back. A box is
 * saved as its row, after any waiting order, with the place last saved.
 * Every post goes through one queue (decision 5). R-78's chain is kept on
 * the boxes; R-79's notice offers to save the order as shown. Closed:
 * every control disabled and nothing draggable. `children` (the legend)
 * sits between the card and the counters, as sportbet draws them.
 */
export function Ladder({
  page,
  children,
}: {
  page: StandingsPage;
  children?: ReactNode;
}) {
  const locked = page.closes.state === 'closed';
  // A stored row that breaks R-78 is mended on load, as sportbet's page
  // cascades (enforceAllLimits).
  const [initial] = useState(() => page.rows.map(keptChain));
  const [rows, setRowsState] = useState<readonly LadderRow[]>(initial);
  const [placesSaved, setPlacesSaved] = useState(page.placesSaved);
  const [messages, setMessages] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const [live, setLive] = useState('');
  const [ring, setRing] = useState(false);
  const [mouseDragged, setMouseDragged] = useState<string | null>(null);
  const [mouseOver, setMouseOver] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    readonly team: string;
    readonly arrow: Arrow;
  } | null>(null);
  const [run] = useState(saveQueue);

  // What the posts read when they are sent, not when they are queued.
  const rowsRef = useRef(rows);
  const saved = useRef<{
    readonly order: readonly string[];
    readonly places: SavedPlaces;
  }>({ order: initial.map((row) => row.team), places: placesOf(initial) });
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  const card = useRef<HTMLDivElement>(null);
  // The club a mouse drag carries, read by the drop itself (not a render's copy).
  const carriedByMouse = useRef<string | null>(null);

  const setRows = (next: readonly LadderRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  };

  const announce = (text: string) => {
    if (announceTimer.current !== null) clearTimeout(announceTimer.current);
    setLive('');
    announceTimer.current = setTimeout(() => {
      setLive(text);
    }, ANNOUNCE_DELAY_MS);
  };

  /** Posts the order shown when its turn comes; refused, the last saved order comes back. */
  const sendOrder = () => {
    if (reorderTimer.current !== null) clearTimeout(reorderTimer.current);
    reorderTimer.current = null;
    void run(async () => {
      const order = rowsRef.current.map((row) => row.team);
      const outcome = await postStandingsOrder(order);
      // Recorded before the queue lets the next post start, so a row save
      // queued behind this order always posts the place it just saved.
      if (outcome.kind === 'saved') {
        saved.current = {
          order,
          places: new Map(order.map((team, index) => [team, index + 1])),
        };
      }
      return outcome;
    }).then((outcome) => {
      if (outcome.kind === 'saved') {
        const places = saved.current.places;
        setRows(
          rowsRef.current.map((row) => ({
            ...row,
            place: places.get(row.team) ?? row.place,
          })),
        );
        setPlacesSaved(true);
        return;
      }
      const byTeam = new Map<string, LadderRow>(
        rowsRef.current.map((row) => [row.team, row]),
      );
      setRows(
        saved.current.order.flatMap((team) => {
          const row = byTeam.get(team);
          return row === undefined ? [] : [row];
        }),
      );
      announce(REFUSED_ORDER);
      setRing(true);
      setTimeout(() => {
        setRing(false);
      }, ERROR_RING_MS);
    });
  };

  /** Sends an order still waiting for the presses to pause, now. */
  const flushOrder = () => {
    if (reorderTimer.current !== null) sendOrder();
  };

  const scheduleOrder = () => {
    if (reorderTimer.current !== null) clearTimeout(reorderTimer.current);
    reorderTimer.current = setTimeout(sendOrder, REORDER_DELAY_MS);
  };

  /** psCommit: the new order shown and announced. */
  const move = (from: number, to: number) => {
    const next = moved(rowsRef.current, from, to);
    setRows(next);
    const club = next[to];
    if (club !== undefined) {
      announce(announcement(club.name, to + 1, next.length));
    }
  };

  const nudge = (team: string, arrow: Arrow) => {
    const from = rowsRef.current.findIndex((row) => row.team === team);
    const to = from + (arrow === 'up' ? -1 : 1);
    if (from < 0 || to < 0 || to >= rowsRef.current.length) return;
    move(from, to);
    // Focus follows the club, not the place (issue 142).
    setFocus({ team, arrow });
    scheduleOrder();
  };

  /** psDrop: `team` put where `target` is, and the order sent at once. */
  const drop = (team: string, target: string | null) => {
    const current = rowsRef.current;
    const from = current.findIndex((row) => row.team === team);
    const to = current.findIndex((row) => row.team === target);
    if (from < 0 || to < 0 || from === to) return;
    move(from, to);
    sendOrder();
  };

  /**
   * A row's boxes changed: shown at once, then saved as the row, after any
   * waiting order - kept to R-78's chain first (keptChain), so a stored row
   * that breaks it is saved mended rather than refused.
   */
  const saveRow = (team: string, change: (row: LadderRow) => LadderRow) => {
    const before = rowsRef.current.find((row) => row.team === team);
    if (before === undefined) return;
    const after = keptChain(change(before));
    setRows(rowsRef.current.map((row) => (row.team === team ? after : row)));
    flushOrder();
    void run(() =>
      postStandingsRow({
        team,
        place: saved.current.places.get(team) ?? null,
        playOffs: after.playOffs === true,
        finalFour: after.finalFour === true,
        finalPlace: enteredFinalPlace(after),
      }),
    ).then((outcome) => {
      if (outcome.kind === 'saved') {
        setMessages((all) =>
          Object.fromEntries(
            Object.entries(all).filter(([key]) => key !== team),
          ),
        );
        return;
      }
      setMessages((all) => ({ ...all, [team]: outcome.message }));
      setRows(rowsRef.current.map((row) => (row.team === team ? before : row)));
    });
  };

  const tick = (team: string, field: StandingsStage, checked: boolean) => {
    saveRow(team, (row) => afterTick(row, field, checked));
  };

  const finalPlace = (team: string, text: string) => {
    // The box takes the places an entry may name (min, max); anything else
    // typed is not saved.
    const value = text === '' ? null : Number(text);
    if (value !== null && !isEnteredFinalPlace(value)) return;
    saveRow(team, (row) => ({ ...row, finalPlace: value }));
  };

  // The latest handlers, for the listeners attached once below.
  const latest = useRef({ flushOrder });
  latest.current = { flushOrder };

  useEffect(() => {
    if (focus === null) return;
    arrows.current.get(`${focus.team}:${focus.arrow}`)?.focus();
  }, [focus]);

  // An order still waiting when the page goes is posted.
  useEffect(
    () => () => {
      latest.current.flushOrder();
    },
    [],
  );

  const touch = useTouchDrag(card, { locked, onDrop: drop });
  const dragged = touch.carried ?? mouseDragged;
  const over = touch.over ?? mouseOver;

  const counts = standingsCounts(rows);

  const arrowRef =
    (team: string, arrow: Arrow) => (button: HTMLButtonElement | null) => {
      const key = `${team}:${arrow}`;
      if (button === null) arrows.current.delete(key);
      else arrows.current.set(key, button);
    };

  return (
    <>
      {!locked && !placesSaved ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-warn bg-warn-tint px-3 py-2 text-[0.8rem] text-text">
          <span>{UNSAVED}</span>
          <button
            type="button"
            onClick={sendOrder}
            className="rounded-[6px] bg-warn px-3 py-1 text-[0.8rem] font-bold text-on-warn hover:bg-warn-hover"
          >
            Išsaugoti šią tvarką
          </button>
        </div>
      ) : null}
      <div
        ref={card}
        className={`overflow-hidden rounded-[8px] border bg-card ${ring ? 'border-bad shadow-[0_0_0_2px_var(--color-bad-tint)]' : 'border-border'}`}
      >
        <div className="bg-accent-tint px-2.5 py-[5px] text-[0.7rem] font-bold tracking-[0.06em] text-accent uppercase">
          Lentelė
        </div>
        <div
          className={`${GRID} mb-px border-b border-border pb-1 text-[0.65rem] font-bold text-muted uppercase`}
        >
          <span className="text-center">#</span>
          <span />
          <span className="text-center">Vieta</span>
          <span className="text-center">1/4</span>
          <span className="text-center">1/2</span>
          <span className="text-center">F</span>
        </div>
        {rows.map((row, index) => {
          const message = messages[row.team] ?? null;
          return (
            <div
              key={row.team}
              data-testid="ladder-row"
              data-team={row.team}
              data-name={row.name}
              draggable={locked ? undefined : true}
              onDragStart={
                locked
                  ? undefined
                  : (event) => {
                      // Cancelled by useTouchDrag: a phone's long press.
                      if (event.defaultPrevented) return;
                      event.dataTransfer.effectAllowed = 'move';
                      // Firefox starts no drag without a payload.
                      event.dataTransfer.setData('text/plain', row.team);
                      carriedByMouse.current = row.team;
                      setMouseDragged(row.team);
                    }
              }
              onDragOver={
                locked
                  ? undefined
                  : (event) => {
                      const carried = carriedByMouse.current;
                      if (carried === null) return;
                      event.preventDefault();
                      setMouseOver(row.team === carried ? null : row.team);
                    }
              }
              onDrop={
                locked
                  ? undefined
                  : (event) => {
                      const carried = carriedByMouse.current;
                      if (carried === null) return;
                      event.preventDefault();
                      carriedByMouse.current = null;
                      drop(carried, row.team);
                      setMouseDragged(null);
                      setMouseOver(null);
                    }
              }
              onDragEnd={
                locked
                  ? undefined
                  : () => {
                      carriedByMouse.current = null;
                      setMouseDragged(null);
                      setMouseOver(null);
                    }
              }
              className={`text-[0.78rem] ${dragged === row.team ? 'opacity-40' : ''} ${over === row.team ? 'bg-accent-tint shadow-[inset_0_-2px_0_var(--color-accent)]' : ''}`}
            >
              <div className={GRID}>
                <div className="flex min-w-0 items-center gap-[3px] select-none">
                  <span
                    data-testid="ladder-rank"
                    className="min-w-[15px] text-right text-[0.82rem] font-bold text-accent tabular-nums"
                  >
                    {placesSaved ? index + 1 : '-'}
                  </span>
                  {locked ? null : (
                    <span
                      data-testid="ladder-grip"
                      aria-hidden="true"
                      className="text-[0.7rem] leading-none text-muted max-[575px]:hidden"
                    >
                      ⠿
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-1">
                  <TeamCrest team={row.name} size="line" />
                  <span className="min-w-0 flex-1 truncate select-none">
                    {row.name}
                  </span>
                </div>
                <div className="flex justify-center gap-[2px]">
                  {(['up', 'down'] as const).map((arrow) => (
                    <button
                      key={arrow}
                      ref={arrowRef(row.team, arrow)}
                      type="button"
                      aria-label={`${arrow === 'up' ? 'Pakelti' : 'Nuleisti'}: ${row.name}`}
                      aria-disabled={
                        arrow === 'up' ? index === 0 : index === rows.length - 1
                      }
                      disabled={locked}
                      onClick={() => {
                        nudge(row.team, arrow);
                      }}
                      className={NUDGE}
                    >
                      {arrow === 'up' ? '▲' : '▼'}
                    </button>
                  ))}
                </div>
                {(['playOffs', 'finalFour'] as const).map((field) => (
                  <div key={field} className="flex justify-center">
                    <input
                      type="checkbox"
                      aria-label={`${field === 'playOffs' ? '1/4' : '1/2'}: ${row.name}`}
                      checked={row[field] === true}
                      disabled={locked || !tickOpen(rows, row, field)}
                      onChange={(event) => {
                        tick(row.team, field, event.target.checked);
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
                    disabled={locked || !finalPlaceOpen(row)}
                    onChange={(event) => {
                      finalPlace(row.team, event.target.value);
                    }}
                    className={FINAL_BOX}
                  />
                </div>
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
        })}
      </div>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {live}
      </div>
      <div data-testid="ladder-counters" className="mt-3 flex flex-wrap gap-2">
        <Counter label="Vieta" have={counts.places} want={page.totals.places} />
        <Counter
          label="1/4"
          have={counts.playOffs}
          want={page.totals.playOffs}
        />
        <Counter
          label="1/2"
          have={counts.finalFour}
          want={page.totals.finalFour}
        />
        <Counter
          label="F"
          have={counts.finalPlaces}
          want={page.totals.finalPlaces}
        />
      </div>
    </>
  );
}
