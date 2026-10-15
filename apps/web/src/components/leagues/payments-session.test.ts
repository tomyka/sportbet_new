import { paymentsMeter, type PaymentTotals } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import {
  createPaymentsSession,
  SAVED_MARK_MS,
  type PaymentsOutcome,
  type PaymentsSessionState,
} from './payments-session';

// The board's state machine (lp-board's script, R-123): a row posts itself,
// the meter moves to the server's totals, the marks come and go.

const TOTALS: PaymentTotals = {
  collected: 2000,
  expected: 4000,
  paidCount: 1,
  memberCount: 2,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function setUp(
  post?: (member: number, raw: string) => Promise<PaymentsOutcome>,
) {
  const posted: [number, string][] = [];
  const timers: { run: () => void; ms: number; handle: number }[] = [];
  const changes: PaymentsSessionState[] = [];
  const session = createPaymentsSession({
    page: {
      hasFee: true,
      meter: paymentsMeter({ ...TOTALS, collected: 0, paidCount: 0 }, true),
      rows: [
        { member: 5, paid: false },
        { member: 6, paid: false },
      ],
    },
    post:
      post ??
      ((member, raw) => {
        posted.push([member, raw]);
        return Promise.resolve({ kind: 'saved', totals: TOTALS });
      }),
    timer: {
      set: (run, ms) => {
        const handle = timers.length + 1;
        timers.push({ run, ms, handle });
        return handle;
      },
      clear: (handle) => {
        const found = timers.findIndex((timer) => timer.handle === handle);
        if (found >= 0) timers.splice(found, 1);
      },
    },
    onChange: (state) => changes.push(state),
  });
  return { session, posted, timers, changes };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPaymentsSession', () => {
  it('starts on the page: the meter, every chip, no marks', () => {
    const { session } = setUp();
    expect(session.state().meter.collected).toBe('0.00');
    expect(session.state().chips).toEqual({ 5: false, 6: false });
    expect(session.state().marks).toEqual({});
  });

  it('a change posts its own member and the trimmed text, and shows Saugoma... meanwhile', async () => {
    const wait = deferred<PaymentsOutcome>();
    const posted: [number, string][] = [];
    const { session } = setUp((member, raw) => {
      posted.push([member, raw]);
      return wait.promise;
    });
    session.change(6, '  20 ');
    await settle();
    expect(posted).toEqual([[6, '20']]);
    expect(session.state().marks).toEqual({ 6: 'saving' });
    wait.resolve({ kind: 'saved', totals: TOTALS });
    await settle();
  });

  it('the chip and the meter move to the answer, drawn by the domain from its cents', async () => {
    const { session } = setUp();
    session.change(5, '20');
    await settle();
    expect(session.state().chips[5]).toBe(true);
    expect(session.state().marks).toEqual({ 5: 'saved' });
    expect(session.state().meter).toEqual(paymentsMeter(TOTALS, true));
    expect(session.state().meter).toMatchObject({
      collected: '20.00',
      expected: '40.00',
      paidCount: 1,
      memberCount: 2,
      percent: 50,
    });
  });

  it('a blank posts paid[id]= and shows Nesumokėta', async () => {
    const { session, posted } = setUp();
    session.change(5, '20');
    await settle();
    session.change(5, '   ');
    await settle();
    expect(posted).toEqual([
      [5, '20'],
      [5, ''],
    ]);
    expect(session.state().chips[5]).toBe(false);
  });

  it('the saved mark is cleared after 1.8 s, if it is still the saved one', async () => {
    const { session, timers } = setUp();
    session.change(5, '20');
    await settle();
    expect(timers.map((timer) => timer.ms)).toEqual([SAVED_MARK_MS]);
    expect(SAVED_MARK_MS).toBe(1800);
    timers[0]?.run();
    expect(session.state().marks).toEqual({});
  });

  it("a new change cancels the row's waiting clear, so it cannot wipe the next mark", async () => {
    const { session, timers } = setUp();
    session.change(5, '20');
    await settle();
    session.change(5, '30');
    expect(timers).toEqual([]);
    expect(session.state().marks).toEqual({ 5: 'saving' });
  });

  it('a failure shows Neišsaugota and leaves the chip and the meter as they were', async () => {
    const { session } = setUp(() =>
      Promise.resolve({ kind: 'refused', message: 'x' }),
    );
    const before = session.state().meter;
    session.change(5, 'abc');
    await settle();
    expect(session.state().marks).toEqual({ 5: 'failed' });
    expect(session.state().chips[5]).toBe(false);
    expect(session.state().meter).toEqual(before);
  });

  it('two quick changes post in order, the second only once the first has answered', async () => {
    const first = deferred<PaymentsOutcome>();
    const posted: string[] = [];
    let calls = 0;
    const { session } = setUp((_member, raw) => {
      posted.push(raw);
      calls += 1;
      return calls === 1
        ? first.promise
        : Promise.resolve({ kind: 'saved', totals: TOTALS });
    });
    session.change(5, '1');
    session.change(6, '2');
    await settle();
    expect(posted).toEqual(['1']);
    first.resolve({ kind: 'saved', totals: TOTALS });
    await settle();
    expect(posted).toEqual(['1', '2']);
  });

  it('tells its listener of every change', async () => {
    const { session, changes } = setUp();
    session.change(5, '20');
    await settle();
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.at(-1)).toEqual(session.state());
  });

  it('without a fee the meter has no expected and no bar', async () => {
    const changes: PaymentsSessionState[] = [];
    const session = createPaymentsSession({
      page: {
        hasFee: false,
        meter: paymentsMeter({ ...TOTALS, expected: 0 }, false),
        rows: [{ member: 5, paid: false }],
      },
      post: () =>
        Promise.resolve({
          kind: 'saved',
          totals: { ...TOTALS, expected: 0 },
        }),
      timer: { set: () => 1, clear: () => undefined },
      onChange: (state) => changes.push(state),
    });
    session.change(5, '20');
    await settle();
    expect(session.state().meter).toMatchObject({
      expected: null,
      percent: null,
    });
  });

  it('dispose cancels the waiting clears', async () => {
    const { session, timers } = setUp();
    session.change(5, '20');
    await settle();
    session.dispose();
    expect(timers).toEqual([]);
  });
});
