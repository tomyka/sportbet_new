import { afterEach, describe, expect, it, vi } from 'vitest';
import { postSurvivalPick, readSurvivalAnswer } from './survival-answer';

describe('postSurvivalPick', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts teamID and round to the save, and reads the answer', async () => {
    const fetch = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(Response.json({ success: true }, { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    expect(await postSurvivalPick({ team: '9005', round: 1 })).toEqual({
      kind: 'saved',
    });
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/prediction/predictionSurvival/save');
    expect(
      init?.body instanceof URLSearchParams ? init.body.toString() : null,
    ).toBe('teamID=9005&round=1');
  });

  it('a lost connection: the survival line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect(await postSurvivalPick({ team: '1', round: 1 })).toEqual({
      kind: 'refused',
      message: 'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
    });
  });
});

// updateUserSurvivalSelection's .done and svShowRefusal: only a 422 is a
// refusal written for the player; anything else is the fallback.

describe('readSurvivalAnswer (survival.blade.php)', () => {
  it('200 {success: true}: saved', () => {
    expect(readSurvivalAnswer(200, { success: true })).toEqual({
      kind: 'saved',
    });
  });

  it("a 422: the server's message", () => {
    expect(
      readSurvivalAnswer(422, {
        success: false,
        message: 'Šios komandos rungtynės jau prasidėjo.',
      }),
    ).toEqual({
      kind: 'refused',
      message: 'Šios komandos rungtynės jau prasidėjo.',
    });
  });

  it('anything but a 422 - a 429, a 503, a 401, a 500 - is the fallback', () => {
    for (const status of [429, 503, 401, 500]) {
      expect(
        readSurvivalAnswer(status, { success: false, message: 'Kita.' }),
      ).toEqual({
        kind: 'refused',
        message: 'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
      });
    }
  });

  it('a body that is not the answer is the fallback', () => {
    for (const [status, body] of [
      [200, { success: false }],
      [422, null],
      [422, { message: 'x' }],
    ] as const) {
      expect(readSurvivalAnswer(status, body)).toEqual({
        kind: 'refused',
        message: 'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
      });
    }
  });
});
