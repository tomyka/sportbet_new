'use client';

import type { JSX } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  PaymentsMeter,
  PaymentsPage,
  PaymentsRow,
} from '@sportbet/domain';
import { postPayment } from './payments-post';
import {
  createPaymentsSession,
  type PaymentsSession,
  type PaymentsSessionState,
  type RowMark,
} from './payments-session';

const MARK_TEXT: Readonly<Record<RowMark, string>> = {
  saving: 'Saugoma...',
  saved: '✓',
  failed: 'Neišsaugota',
};

const MARK_TONE: Readonly<Record<RowMark, string>> = {
  saving: 'text-muted',
  saved: 'text-ok',
  failed: 'text-bad',
};

/** The board's session (payments-session.ts), held for React: one per mounted board. */
function usePaymentsSession(page: PaymentsPage): {
  readonly session: PaymentsSession;
  readonly state: PaymentsSessionState;
} {
  const [store] = useState(() => {
    const listeners = new Set<() => void>();
    const session = createPaymentsSession({
      page: {
        hasFee: page.hasFee,
        meter: page.meter,
        rows: page.rows.map((row) => ({ member: row.member, paid: row.paid })),
      },
      post: postPayment(page.league.id),
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
  useEffect(
    () => () => {
      store.session.dispose();
    },
    [store],
  );
  return { session: store.session, state };
}

/** The pot, "iš" the expected pot (only with a fee), and how many have paid; the bar follows the money. */
function Meter({ meter }: { meter: PaymentsMeter }): JSX.Element {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[1.35rem] font-extrabold tracking-[-0.01em] tabular-nums">
          <span data-testid="collected">{`${meter.collected}€`}</span>
          {meter.expected === null ? null : (
            <small className="text-[0.8rem] font-semibold text-muted">
              {' iš '}
              <span data-testid="expected">{`${meter.expected}€`}</span>
            </small>
          )}
        </span>
        <span
          data-testid="count"
          className="text-[0.78rem] text-muted tabular-nums"
        >
          {`Sumokėjo ${String(meter.paidCount)} iš ${String(meter.memberCount)}`}
        </span>
      </div>
      {meter.percent === null ? null : (
        <div className="h-2 overflow-hidden rounded-full border border-border bg-surface-2">
          <div
            data-testid="bar"
            className="h-full bg-ok transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${String(meter.percent)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Chip({ paid }: { paid: boolean }): JSX.Element {
  return (
    <span
      className={`inline-block rounded-full border px-[9px] py-0.5 text-[0.66rem] font-bold whitespace-nowrap ${paid ? 'border-ok bg-ok-tint text-ok' : 'border-bad bg-bad-tint text-bad'}`}
    >
      {paid ? 'Sumokėta' : 'Nesumokėta'}
    </span>
  );
}

function Row({
  row,
  paid,
  mark,
}: {
  row: PaymentsRow;
  paid: boolean;
  mark: RowMark | undefined;
}): JSX.Element {
  const id = `lp-paid-${String(row.member)}`;
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-2">
        <label htmlFor={id} className="m-0 text-[0.86rem] font-semibold">
          {row.display}
        </label>
        <span className="ml-1.5 text-[0.75rem] text-muted">{row.username}</span>
        {row.isGuest ? (
          <span className="ml-1.5 rounded-full border border-border px-1.5 py-px text-[0.66rem] font-bold tracking-[0.05em] text-muted uppercase">
            Svečias
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-2">
        <Chip paid={paid} />
      </td>
      <td className="w-[150px] py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <span
            role="status"
            data-testid={`state-${String(row.member)}`}
            className={`min-w-[68px] text-right text-[0.7rem] font-bold whitespace-nowrap ${mark === undefined ? '' : MARK_TONE[mark]}`}
          >
            {mark === undefined ? '' : MARK_TEXT[mark]}
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            id={id}
            data-amount={String(row.member)}
            defaultValue={row.amountText}
            placeholder="—"
            aria-label={row.display}
            aria-invalid={mark === 'failed'}
            className={`w-14 flex-none rounded-md border px-2 py-1 text-right text-[0.85rem] text-text tabular-nums ${mark === 'failed' ? 'border-bad bg-bad-tint' : 'border-border bg-card'}`}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * league-payments-form.blade.php: the meter, then one amount box per member
 * - no form and no Save button: a box posts itself the moment it is left
 * (the native `change`, as sportbet's script listens), and the meter moves
 * to the totals the server answers (R-123: `1,234.50€` before and after).
 * The box keeps what was typed when a save fails.
 */
export function PaymentsBoard({ page }: { page: PaymentsPage }): JSX.Element {
  const { session, state } = usePaymentsSession(page);
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = board.current;
    if (element === null) return;
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const member = Number(target.dataset['amount']);
      if (Number.isInteger(member)) session.change(member, target.value);
    };
    element.addEventListener('change', onChange);
    return () => {
      element.removeEventListener('change', onChange);
    };
  }, [session]);
  return (
    <div ref={board}>
      <Meter meter={state.meter} />
      <div className="overflow-x-auto">
        <table className="w-full align-middle">
          <thead>
            <tr className="text-left text-[0.72rem] font-bold tracking-[0.06em] text-muted uppercase">
              <th className="pb-2">Dalyvis</th>
              <th className="pb-2">Būsena</th>
              <th className="w-[150px] pb-2 text-right">Sumokėta (€)</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <Row
                key={row.member}
                row={row}
                paid={state.chips[row.member] ?? false}
                mark={state.marks[row.member]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
