import {
  finalPlaceFromText,
  StandingsTable,
  type StandingsStage,
  type StandingsView,
  type TeamId,
} from '@sportbet/domain';
import { announcement, moved } from './ladder-moves';
import { saveQueue } from './save-queue';
import type { StandingsOutcome } from './standings-answer';
import type { StandingsRowRequest } from './standings-protocol';

/** How long after the last move the order is posted, so a run of arrow presses is one save. */
export const REORDER_DELAY_MS = 400;

/** psAnnounce: cleared first and written a beat later, so a repeat is still read. */
export const ANNOUNCE_DELAY_MS = 50;

/** .ps-ladder-error: how long a refused order's red ring stays. */
export const ERROR_RING_MS = 1500;

const REFUSED_ORDER = 'Tvarkos išsaugoti nepavyko, grąžinta ankstesnė.';

/** The two saves the ladder posts (production: standings-answer.ts). */
export interface LadderPosts {
  row(request: StandingsRowRequest): Promise<StandingsOutcome>;
  order(teams: readonly string[]): Promise<StandingsOutcome>;
}

/** A timer (production: the window's; tests: one moved by hand). */
export interface LadderTimer {
  set(run: () => void, ms: number): number;
  clear(handle: number): void;
}

/** What the ladder draws. */
export interface LadderState {
  /** The table as shown (StandingsTable.view): the rows in the shown order, mended to R-78's chain, each with its boxes. */
  readonly view: StandingsView;
  /** A refused row's message (R-59), by team. */
  readonly messages: Readonly<Record<string, string>>;
  /** The live region's text. */
  readonly live: string;
  /** A refused order's red ring on the card. */
  readonly ring: boolean;
}

export interface LadderSession {
  readonly state: () => LadderState;
  /** An arrow: the row at `from` to `to`; the order posted once the moves pause. */
  readonly move: (from: number, to: number) => void;
  /** A drag dropped: the row at `from` to `to`; the order posted at once. */
  readonly drop: (from: number, to: number) => void;
  /** R-79: the order as shown, posted now. */
  readonly saveShownOrder: () => void;
  readonly tick: (
    team: TeamId,
    stage: StandingsStage,
    checked: boolean,
  ) => void;
  /** The final place box's text: blank, 1 or 2 posted; anything else not. */
  readonly finalPlace: (team: TeamId, text: string) => void;
  /** The ladder goes: an order still waiting is posted. */
  readonly dispose: () => void;
}

/**
 * standings.blade.php's ladder saves as one session (issue 139, #24): the
 * shown table, every post through one queue (decision 5), an order posted
 * whole once arrow presses pause (or at once for a drop or R-79's button),
 * a refused order putting the last saved one back with its announcement
 * and the card's red ring, a box saved as its row - after any waiting
 * order, with the place last saved (recorded inside the queued post, so
 * the next post cannot start before it), kept to R-78's chain - and a
 * refused row put back with its message (R-59). `onChange` hears every
 * new state.
 */
export function createLadderSession({
  view,
  post,
  timer,
  onChange,
}: {
  readonly view: StandingsView;
  readonly post: LadderPosts;
  readonly timer: LadderTimer;
  readonly onChange: (state: LadderState) => void;
}): LadderSession {
  // The table mends a stored row that breaks R-78 on load, as sportbet's
  // page cascades (enforceAllLimits).
  let table = StandingsTable.fromView(view);
  let state: LadderState = {
    view: table.view(),
    messages: {},
    live: '',
    ring: false,
  };
  const run = saveQueue();
  let reorderTimer: number | null = null;
  let announceTimer: number | null = null;

  const update = (change: Partial<LadderState>) => {
    state = { ...state, ...change };
    onChange(state);
  };

  /** The shown table changed: its view is the state's. */
  const showTable = (
    next: StandingsTable,
    change: Partial<LadderState> = {},
  ) => {
    table = next;
    update({ ...change, view: table.view() });
  };

  const announce = (text: string) => {
    if (announceTimer !== null) timer.clear(announceTimer);
    update({ live: '' });
    announceTimer = timer.set(() => {
      announceTimer = null;
      update({ live: text });
    }, ANNOUNCE_DELAY_MS);
  };

  const sendOrder = () => {
    if (reorderTimer !== null) timer.clear(reorderTimer);
    reorderTimer = null;
    // Either answer is applied inside the queued post, before the queue
    // lets the next post start: a row queued behind this order posts the
    // place it saved (entryOf), or sees the last saved order back.
    void run(async () => {
      const order = state.view.rows.map((row) => row.team);
      const outcome = await post.order(order);
      if (outcome.kind === 'saved') {
        // A move made while the order was in flight stays shown.
        const shownOrder = state.view.rows.map((row) => row.team);
        showTable(table.withSavedOrder(order).withOrder(shownOrder));
        return;
      }
      showTable(table.withLastSavedOrder(), { ring: true });
      announce(REFUSED_ORDER);
      timer.set(() => {
        update({ ring: false });
      }, ERROR_RING_MS);
    });
  };

  /** Sends an order still waiting for the moves to pause, now. */
  const flushOrder = () => {
    if (reorderTimer !== null) sendOrder();
  };

  /** psCommit: the new order shown and announced; false past either end. */
  const show = (from: number, to: number): boolean => {
    const rows = state.view.rows;
    if (from < 0 || to < 0 || from >= rows.length || to >= rows.length) {
      return false;
    }
    if (from === to) return false;
    const next = moved(rows, from, to);
    showTable(table.withOrder(next.map((row) => row.team)));
    const club = next[to];
    if (club !== undefined) {
      announce(announcement(club.name, to + 1, next.length));
    }
    return true;
  };

  const saveRow = (
    team: TeamId,
    change: (shown: StandingsTable) => StandingsTable,
  ) => {
    const before = state.view.rows.find((row) => row.team === team);
    if (before === undefined) return;
    showTable(change(table));
    flushOrder();
    // The row as the table posts it when its turn comes (entryOf): as
    // shown, its place as last saved, each box ticked or not. Its answer is
    // applied inside the queued post, before the next one starts.
    void run(async () => {
      const outcome = await post.row(table.entryOf(team));
      if (outcome.kind === 'saved') {
        update({
          messages: Object.fromEntries(
            Object.entries(state.messages).filter(([key]) => key !== team),
          ),
        });
        return;
      }
      showTable(table.withBoxesOf(team, before), {
        messages: { ...state.messages, [team]: outcome.message },
      });
    });
  };

  return {
    state: () => state,
    move: (from, to) => {
      if (!show(from, to)) return;
      if (reorderTimer !== null) timer.clear(reorderTimer);
      reorderTimer = timer.set(sendOrder, REORDER_DELAY_MS);
    },
    drop: (from, to) => {
      if (show(from, to)) sendOrder();
    },
    saveShownOrder: sendOrder,
    tick: (team, stage, checked) => {
      saveRow(team, (shown) => shown.withTick(team, stage, checked));
    },
    finalPlace: (team, text) => {
      // Read as the save reads `final` (finalPlaceFromText): anything but
      // blank, 1 or 2 is not saved.
      const place = finalPlaceFromText(text);
      if (!place.ok) return;
      saveRow(team, (shown) => shown.withFinalPlace(team, place.value));
    },
    dispose: flushOrder,
  };
}
