'use client';

import type { JSX } from 'react';
import type { StandingsCounts, StandingsView } from '@sportbet/domain';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { createLadderSession, type LadderSession } from './ladder-session';
import {
  GRID,
  LadderRowView,
  type Arrow,
  type ArrowFocus,
  type DragHandlers,
} from './ladder-row';
import { postStandingsOrder, postStandingsRow } from './standings-answer';
import { useTouchDrag } from './use-touch-drag';

export { REORDER_DELAY_MS } from './ladder-session';

const UNSAVED =
  'Lentelė dar neišsaugota. Perkelkite komandą arba išsaugokite tvarką, kokią matote.';

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

/** A mouse drag: the row carried (read by the drop itself, not a render's copy), the row it is over, and each row's handlers. */
function useMouseDrag(drop: (team: string, target: string) => void): {
  readonly dragged: string | null;
  readonly over: string | null;
  readonly handlersFor: (team: string) => DragHandlers;
} {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const carried = useRef<string | null>(null);
  const done = () => {
    carried.current = null;
    setDragged(null);
    setOver(null);
  };
  const handlersFor = (team: string): DragHandlers => ({
    draggable: true,
    onDragStart: (event) => {
      // Cancelled by useTouchDrag: a phone's long press.
      if (event.defaultPrevented) return;
      event.dataTransfer.effectAllowed = 'move';
      // Firefox starts no drag without a payload.
      event.dataTransfer.setData('text/plain', team);
      carried.current = team;
      setDragged(team);
    },
    onDragOver: (event) => {
      if (carried.current === null) return;
      event.preventDefault();
      setOver(team === carried.current ? null : team);
    },
    onDrop: (event) => {
      const from = carried.current;
      if (from === null) return;
      event.preventDefault();
      done();
      drop(from, team);
    },
    onDragEnd: done,
  });
  return { dragged, over, handlersFor };
}

function useArrowFocus(): ArrowFocus {
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  const [focus, setFocus] = useState<{
    readonly team: string;
    readonly arrow: Arrow;
  } | null>(null);
  useEffect(() => {
    if (focus === null) return;
    arrows.current.get(`${focus.team}:${focus.arrow}`)?.focus();
  }, [focus]);
  return {
    arrowRef: (team, arrow) => (button) => {
      const key = `${team}:${arrow}`;
      if (button === null) arrows.current.delete(key);
      else arrows.current.set(key, button);
    },
    focusAfter: (team, arrow) => {
      setFocus({ team, arrow });
    },
  };
}

/** R-79: the table is not saved yet - "Išsaugoti šią tvarką" saves the order as shown. */
function UnsavedNotice({ onSave }: { onSave: () => void }): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-warn bg-warn-tint px-3 py-2 text-[0.8rem] text-text">
      <span>{UNSAVED}</span>
      <button
        type="button"
        onClick={onSave}
        className="rounded-[6px] bg-warn px-3 py-1 text-[0.8rem] font-bold text-on-warn hover:bg-warn-hover"
      >
        Išsaugoti šią tvarką
      </button>
    </div>
  );
}

/** The card's title and its header row: #, Vieta, 1/4, 1/2, F. */
function CardHeader(): JSX.Element {
  return (
    <>
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
    </>
  );
}

/** #ps-progress: places, the two stages and the final places, each against its total. */
function Counters({
  counts,
  totals,
}: {
  counts: StandingsCounts;
  totals: StandingsCounts;
}): JSX.Element {
  return (
    <div data-testid="ladder-counters" className="mt-3 flex flex-wrap gap-2">
      <Counter label="Vieta" have={counts.places} want={totals.places} />
      <Counter label="1/4" have={counts.playOffs} want={totals.playOffs} />
      <Counter label="1/2" have={counts.finalFour} want={totals.finalFour} />
      <Counter label="F" have={counts.finalPlaces} want={totals.finalPlaces} />
    </div>
  );
}

/** How the rows move: a mouse drag, a long-press touch drag and the arrows (focus following the club), each through the session. */
function useLadderMoves(
  session: LadderSession,
  card: RefObject<HTMLDivElement | null>,
  reorderable: boolean,
): {
  readonly dragged: string | null;
  readonly over: string | null;
  readonly handlersFor: (team: string) => DragHandlers;
  readonly focus: ArrowFocus;
  readonly nudge: (team: string, arrow: Arrow) => void;
} {
  const focus = useArrowFocus();
  const indexOf = (team: string | null) =>
    session.state().view.rows.findIndex((row) => row.team === team);
  /** psDrop: `team` put where `target` is, and the order sent at once. */
  const drop = (team: string, target: string | null) => {
    session.drop(indexOf(team), indexOf(target));
  };
  const mouse = useMouseDrag(drop);
  const touch = useTouchDrag(card, { locked: !reorderable, onDrop: drop });
  return {
    dragged: touch.carried ?? mouse.dragged,
    over: touch.over ?? mouse.over,
    handlersFor: mouse.handlersFor,
    focus,
    nudge: (team, arrow) => {
      const from = indexOf(team);
      // A move past either end is the session's to refuse.
      session.move(from, from + (arrow === 'up' ? -1 : 1));
      focus.focusAfter(team, arrow);
    },
  };
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
}): JSX.Element {
  const { session, state } = useLadderSession(page);
  const { rows, placesSaved, counts, reorderable, offerSaveShown } = state.view;
  const card = useRef<HTMLDivElement>(null);
  const { dragged, over, handlersFor, focus, nudge } = useLadderMoves(
    session,
    card,
    reorderable,
  );
  return (
    <>
      {offerSaveShown ? (
        <UnsavedNotice
          onSave={() => {
            session.saveShownOrder();
          }}
        />
      ) : null}
      <div
        ref={card}
        className={`overflow-hidden rounded-[8px] border bg-card ${state.ring ? 'border-bad shadow-[0_0_0_2px_var(--color-bad-tint)]' : 'border-border'}`}
      >
        <CardHeader />
        {rows.map((row, index) => (
          <LadderRowView
            key={row.team}
            row={row}
            rank={placesSaved ? String(index + 1) : '-'}
            ends={{ first: index === 0, last: index === rows.length - 1 }}
            reorderable={reorderable}
            message={state.messages[row.team] ?? null}
            marked={{ dragged: dragged === row.team, over: over === row.team }}
            drag={reorderable ? handlersFor(row.team) : null}
            focus={focus}
            onNudge={(arrow) => {
              nudge(row.team, arrow);
            }}
            session={session}
          />
        ))}
      </div>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {state.live}
      </div>
      <Counters counts={counts} totals={page.totals} />
    </>
  );
}
