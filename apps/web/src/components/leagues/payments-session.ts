import {
  paymentsMeter,
  type PaymentsMeter,
  type PaymentTotals,
} from '@sportbet/domain';
import type { NotSaved } from '../save/laravel-save';
import { saveQueue } from '../standings/save-queue';

/** lp-board's script: how long the "✓" stays after a save. */
export const SAVED_MARK_MS = 1800;

/** What a row's post came back as: the server's totals, or not saved. */
export type PaymentsOutcome =
  { readonly kind: 'saved'; readonly totals: PaymentTotals } | NotSaved;

/** What the row beside its box says: Saugoma..., ✓, Neišsaugota. */
export type RowMark = 'saving' | 'saved' | 'failed';

/** What the board draws. */
export interface PaymentsSessionState {
  /** The meter, drawn from the last totals the server answered. */
  readonly meter: PaymentsMeter;
  /** Each member's chip: an amount is recorded (Sumokėta) or not. */
  readonly chips: Readonly<Record<number, boolean>>;
  readonly marks: Readonly<Record<number, RowMark>>;
}

/** A timer (production: the window's; tests: one moved by hand). */
interface PaymentsTimer {
  set(run: () => void, ms: number): number;
  clear(handle: number): void;
}

interface SessionInput {
  readonly page: {
    readonly hasFee: boolean;
    readonly meter: PaymentsMeter;
    readonly rows: readonly {
      readonly member: number;
      readonly paid: boolean;
    }[];
  };
  /** Posts one row's trimmed text (production: payments-post.ts). */
  readonly post: (member: number, raw: string) => Promise<PaymentsOutcome>;
  readonly timer: PaymentsTimer;
  readonly onChange: (state: PaymentsSessionState) => void;
}

export interface PaymentsSession {
  readonly state: () => PaymentsSessionState;
  /** A box changed: its trimmed text is posted when its turn comes. */
  readonly change: (member: number, text: string) => void;
  readonly dispose: () => void;
}

/**
 * The payments board's workings (league-payments-form's script): one post
 * per changed row, one at a time and in order; the meter is the server's
 * arithmetic, drawn by the domain from the totals of each answer, never
 * summed here; a failure marks the row and changes nothing else.
 */
export function createPaymentsSession(input: SessionInput): PaymentsSession {
  const { page, post, timer, onChange } = input;
  const run = saveQueue();
  const clears = new Map<number, number>();
  let state: PaymentsSessionState = {
    meter: page.meter,
    chips: Object.fromEntries(page.rows.map((row) => [row.member, row.paid])),
    marks: {},
  };

  const update = (change: Partial<PaymentsSessionState>): void => {
    state = { ...state, ...change };
    onChange(state);
  };
  const mark = (member: number, next: RowMark | null): void => {
    const others = Object.entries(state.marks).filter(
      ([key]) => Number(key) !== member,
    );
    update({
      marks: Object.fromEntries(
        next === null ? others : [...others, [String(member), next]],
      ),
    });
  };
  const cancelClear = (member: number): void => {
    const handle = clears.get(member);
    if (handle === undefined) return;
    timer.clear(handle);
    clears.delete(member);
  };
  const saved = (member: number, raw: string, totals: PaymentTotals): void => {
    update({
      meter: paymentsMeter(totals, page.hasFee),
      chips: { ...state.chips, [member]: raw !== '' },
    });
    mark(member, 'saved');
    clears.set(
      member,
      timer.set(() => {
        clears.delete(member);
        if (state.marks[member] === 'saved') mark(member, null);
      }, SAVED_MARK_MS),
    );
  };

  return {
    state: () => state,
    change: (member, text) => {
      const raw = text.trim();
      cancelClear(member);
      mark(member, 'saving');
      void run(async () => {
        const outcome = await post(member, raw);
        if (outcome.kind === 'saved') saved(member, raw, outcome.totals);
        else mark(member, 'failed');
      });
    },
    dispose: () => {
      for (const member of [...clears.keys()]) cancelClear(member);
    },
  };
}
