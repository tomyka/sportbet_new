'use client';

import { ENTERED_FINAL_PLACES, type StandingsView } from '@sportbet/domain';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { TeamCrest } from '../hub/team-crest';
import { createLadderSession } from './ladder-session';
import { postStandingsOrder, postStandingsRow } from './standings-answer';
import { useTouchDrag } from './use-touch-drag';

export { REORDER_DELAY_MS } from './ladder-session';

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

/** The ladder's session (ladder-session.ts), held for React: one per mounted ladder. */
function useLadderSession(page: StandingsView) {
  const [store] = useState(() => {
    const listeners = new Set<() => void>();
    const session = createLadderSession({
      view: page,
      post: { row: postStandingsRow, order: postStandingsOrder },
      timer: {
        set: (run, ms) => window.setTimeout(run, ms),
        clear: (handle) => {
          window.clearTimeout(handle);
        },
      },
      onChange: () => {
        for (const listener of listeners) listener();
      },
    });
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    return { session, subscribe };
  });
  const state = useSyncExternalStore(
    store.subscribe,
    store.session.state,
    store.session.state,
  );
  // An order still waiting when the page goes is posted.
  useEffect(
    () => () => {
      store.session.dispose();
    },
    [store],
  );
  return { session: store.session, state };
}

/**
 * standings.blade.php's ladder (issue 139), the Euroleague's one table:
 * the rows in the order they are shown, which is the prediction. Its
 * saves - the queue, the debounced order, the rollbacks, R-78's chain on
 * the boxes - are its session's (ladder-session.ts); this draws the
 * session's state and forwards the arrows (focus following the club), a
 * mouse drag and a long-press touch drag (useTouchDrag) to it. R-79's
 * notice offers to save the order as shown. Closed: every control
 * disabled and nothing draggable. `children` (the legend) sits between the
 * card and the counters, as sportbet draws them.
 */
export function Ladder({
  page,
  children,
}: {
  page: StandingsView;
  children?: ReactNode;
}) {
  const { session, state } = useLadderSession(page);
  const { rows, placesSaved, counts, reorderable, offerSaveShown } = state.view;
  const { messages, live, ring } = state;
  const [mouseDragged, setMouseDragged] = useState<string | null>(null);
  const [mouseOver, setMouseOver] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    readonly team: string;
    readonly arrow: Arrow;
  } | null>(null);
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  const card = useRef<HTMLDivElement>(null);
  // The club a mouse drag carries, read by the drop itself (not a render's copy).
  const carriedByMouse = useRef<string | null>(null);

  const indexOf = (team: string | null) =>
    session.state().view.rows.findIndex((row) => row.team === team);

  const nudge = (team: string, arrow: Arrow) => {
    const from = indexOf(team);
    // A move past either end is the session's to refuse.
    session.move(from, from + (arrow === 'up' ? -1 : 1));
    // Focus follows the club, not the place (issue 142).
    setFocus({ team, arrow });
  };

  /** psDrop: `team` put where `target` is, and the order sent at once. */
  const drop = (team: string, target: string | null) => {
    session.drop(indexOf(team), indexOf(target));
  };

  useEffect(() => {
    if (focus === null) return;
    arrows.current.get(`${focus.team}:${focus.arrow}`)?.focus();
  }, [focus]);

  const touch = useTouchDrag(card, { locked: !reorderable, onDrop: drop });
  const dragged = touch.carried ?? mouseDragged;
  const over = touch.over ?? mouseOver;

  const arrowRef =
    (team: string, arrow: Arrow) => (button: HTMLButtonElement | null) => {
      const key = `${team}:${arrow}`;
      if (button === null) arrows.current.delete(key);
      else arrows.current.set(key, button);
    };

  return (
    <>
      {offerSaveShown ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-warn bg-warn-tint px-3 py-2 text-[0.8rem] text-text">
          <span>{UNSAVED}</span>
          <button
            type="button"
            onClick={() => {
              session.saveShownOrder();
            }}
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
              draggable={reorderable ? true : undefined}
              onDragStart={
                !reorderable
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
                !reorderable
                  ? undefined
                  : (event) => {
                      const carried = carriedByMouse.current;
                      if (carried === null) return;
                      event.preventDefault();
                      setMouseOver(row.team === carried ? null : row.team);
                    }
              }
              onDrop={
                !reorderable
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
                !reorderable
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
                      disabled={!reorderable}
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
