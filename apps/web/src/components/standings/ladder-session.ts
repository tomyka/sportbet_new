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

interface SessionInput {
  readonly view: StandingsView;
  readonly post: LadderPosts;
  readonly timer: LadderTimer;
  readonly onChange: (state: LadderState) => void;
}

/** The session's workings: the shown table, the state drawn from it, the queue and the timers. */
class Ladder {
  readonly #post: LadderPosts;
  readonly #timer: LadderTimer;
  readonly #onChange: (state: LadderState) => void;
  readonly #run = saveQueue();
  #table: StandingsTable;
  #state: LadderState;
  #reorderTimer: number | null = null;
  #announceTimer: number | null = null;

  constructor({ view, post, timer, onChange }: SessionInput) {
    this.#post = post;
    this.#timer = timer;
    this.#onChange = onChange;
    // The table mends a stored row that breaks R-78 on load, as sportbet's
    // page cascades (enforceAllLimits).
    this.#table = StandingsTable.fromView(view);
    this.#state = {
      view: this.#table.view(),
      messages: {},
      live: '',
      ring: false,
    };
  }

  get state(): LadderState {
    return this.#state;
  }

  /** An arrow: shown at once, the order posted once the moves pause. */
  move(from: number, to: number): void {
    if (!this.#show(from, to)) return;
    this.#clearReorder();
    this.#reorderTimer = this.#timer.set(() => {
      this.sendOrder();
    }, REORDER_DELAY_MS);
  }

  /** A drop: shown and posted at once. */
  drop(from: number, to: number): void {
    if (this.#show(from, to)) this.sendOrder();
  }

  /**
   * Posts the order shown when its turn comes. Either answer is applied
   * inside the queued post, before the queue lets the next post start: a
   * row queued behind this order posts the place it saved (entryOf), or
   * sees the last saved order back.
   */
  sendOrder(): void {
    this.#clearReorder();
    void this.#run(async () => {
      const order = this.#shownOrder();
      const outcome = await this.#post.order(order);
      if (outcome.kind === 'saved') {
        // A move made while the order was in flight stays shown.
        this.#showTable(
          this.#table.withSavedOrder(order).withOrder(this.#shownOrder()),
        );
        return;
      }
      this.#refusedOrder();
    });
  }

  /** Sends an order still waiting for the moves to pause, now. */
  flushOrder(): void {
    if (this.#reorderTimer !== null) this.sendOrder();
  }

  /**
   * A row's boxes changed: shown at once, then posted as the table posts
   * it when its turn comes (entryOf: as shown, its place as last saved,
   * each box ticked or not), after any waiting order. Its answer is
   * applied inside the queued post; a refusal puts the row's boxes back
   * with its message (R-59).
   */
  saveRow(
    team: TeamId,
    change: (shown: StandingsTable) => StandingsTable,
  ): void {
    const before = this.#state.view.rows.find((row) => row.team === team);
    if (before === undefined) return;
    this.#showTable(change(this.#table));
    this.flushOrder();
    void this.#run(async () => {
      const outcome = await this.#post.row(this.#table.entryOf(team));
      if (outcome.kind === 'saved') {
        this.#update({ messages: withoutMessage(this.#state.messages, team) });
        return;
      }
      this.#showTable(this.#table.withBoxesOf(team, before), {
        messages: { ...this.#state.messages, [team]: outcome.message },
      });
    });
  }

  /** A refused order: the last saved order back, announced, the card ringed for a while. */
  #refusedOrder(): void {
    this.#showTable(this.#table.withLastSavedOrder(), { ring: true });
    this.#announce(REFUSED_ORDER);
    this.#timer.set(() => {
      this.#update({ ring: false });
    }, ERROR_RING_MS);
  }

  /** psCommit: the new order shown and announced; false past either end. */
  #show(from: number, to: number): boolean {
    const rows = this.#state.view.rows;
    if (
      !inRange(from, rows.length) ||
      !inRange(to, rows.length) ||
      from === to
    ) {
      return false;
    }
    const next = moved(rows, from, to);
    this.#showTable(this.#table.withOrder(next.map((row) => row.team)));
    const club = next[to];
    if (club !== undefined) {
      this.#announce(announcement(club.name, to + 1, next.length));
    }
    return true;
  }

  /** psAnnounce: the live region cleared, then written a beat later. */
  #announce(text: string): void {
    if (this.#announceTimer !== null) this.#timer.clear(this.#announceTimer);
    this.#update({ live: '' });
    this.#announceTimer = this.#timer.set(() => {
      this.#announceTimer = null;
      this.#update({ live: text });
    }, ANNOUNCE_DELAY_MS);
  }

  #clearReorder(): void {
    if (this.#reorderTimer !== null) this.#timer.clear(this.#reorderTimer);
    this.#reorderTimer = null;
  }

  #shownOrder(): TeamId[] {
    return this.#state.view.rows.map((row) => row.team);
  }

  /** The shown table changed: its view is the state's. */
  #showTable(next: StandingsTable, change: Partial<LadderState> = {}): void {
    this.#table = next;
    this.#update({ ...change, view: next.view() });
  }

  #update(change: Partial<LadderState>): void {
    this.#state = { ...this.#state, ...change };
    this.#onChange(this.#state);
  }
}

const inRange = (index: number, length: number): boolean =>
  index >= 0 && index < length;

const withoutMessage = (
  messages: Readonly<Record<string, string>>,
  team: string,
): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(messages).filter(([key]) => key !== team));

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
export function createLadderSession(input: SessionInput): LadderSession {
  const ladder = new Ladder(input);
  return {
    state: () => ladder.state,
    move: (from, to) => {
      ladder.move(from, to);
    },
    drop: (from, to) => {
      ladder.drop(from, to);
    },
    saveShownOrder: () => {
      ladder.sendOrder();
    },
    tick: (team, stage, checked) => {
      ladder.saveRow(team, (shown) => shown.withTick(team, stage, checked));
    },
    finalPlace: (team, text) => {
      // Read as the save reads `final` (finalPlaceFromText): anything but
      // blank, 1 or 2 is not saved.
      const place = finalPlaceFromText(text);
      if (!place.ok) return;
      ladder.saveRow(team, (shown) => shown.withFinalPlace(team, place.value));
    },
    dispose: () => {
      ladder.flushOrder();
    },
  };
}
