import { describe, expect, it } from 'vitest';
import {
  busyAnswer,
  isLockTimeout,
  orBusy,
  refusedAnswer,
  throttledAnswer,
} from './save-answers';

// The answers every autosave gives besides its own: a refusal, too many
// saves, and a save that waited too long for a lock.

describe('refusedAnswer (PredictionSaveResponse::refused)', () => {
  it('is 422 {success: false, message}', () => {
    expect(refusedAnswer('Prognozių laikas baigėsi.')).toEqual({
      status: 422,
      body: { success: false, message: 'Prognozių laikas baigėsi.' },
    });
  });
});

describe('throttledAnswer', () => {
  it("is 429 with the sign-in throttles' text", () => {
    expect(throttledAnswer(1)).toEqual({
      status: 429,
      body: {
        success: false,
        message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
      },
    });
  });
});

// A save gives up after 5 s waiting for a lock (lock_timeout, Postgres
// 55P03): an answer the page shows, never a 500.
describe('a save that waited too long for a lock', () => {
  it('is a 503, "Spėjimas neišsaugotas. Bandykite dar kartą."', () => {
    expect(busyAnswer()).toEqual({
      status: 503,
      body: {
        success: false,
        message: 'Spėjimas neišsaugotas. Bandykite dar kartą.',
      },
    });
  });

  it('is told by its cause, 55P03; any other error is not', () => {
    const cause = Object.assign(new Error('canceling statement'), {
      code: '55P03',
    });
    expect(isLockTimeout(new Error('query failed', { cause }))).toBe(true);
    const other = Object.assign(new Error('x'), { code: '23505' });
    expect(isLockTimeout(new Error('query failed', { cause: other }))).toBe(
      false,
    );
    expect(isLockTimeout(new Error('no cause'))).toBe(false);
  });
});

describe('orBusy: a save, or 503 when it waited past its lock_timeout', () => {
  const lockTimeout = new Error('query failed', {
    cause: Object.assign(new Error('canceling statement'), { code: '55P03' }),
  });

  it("the save's own answer when it goes through", async () => {
    expect(await orBusy(() => Promise.resolve('saved'))).toBe('saved');
  });

  it('the 503 when it waited too long for a lock', async () => {
    expect(await orBusy(() => Promise.reject(lockTimeout))).toEqual(
      busyAnswer(),
    );
  });

  it('any other failure is thrown on', async () => {
    const other = new Error('boom');
    await expect(orBusy(() => Promise.reject(other))).rejects.toBe(other);
  });
});
