import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_NOT_SAVED } from '../save/laravel-save';
import {
  postStandingsOrder,
  postStandingsRow,
  readStandingsAnswer,
} from './standings-answer';

const notSaved = { kind: 'refused', message: SAVE_NOT_SAVED };

describe('readStandingsAnswer (R-59)', () => {
  it('200 {success: true}: saved', () => {
    expect(readStandingsAnswer(200, { success: true })).toEqual({
      kind: 'saved',
    });
  });

  it("a 422 for the fields: the first field's first message", () => {
    expect(
      readStandingsAnswer(422, {
        message: 'Vieta turi būti teigiamas skaičius. (and 1 more error)',
        errors: {
          groupPosition: ['Vieta turi būti teigiamas skaičius.'],
          final: ['Finalo vieta turi būti 1 arba 2.'],
        },
      }),
    ).toEqual({
      kind: 'refused',
      message: 'Vieta turi būti teigiamas skaičius.',
    });
  });

  it('a 422 refusal, a 429 and a 503: their own message', () => {
    for (const status of [422, 429, 503]) {
      expect(
        readStandingsAnswer(status, { success: false, message: 'Tekstas.' }),
      ).toEqual({ kind: 'refused', message: 'Tekstas.' });
    }
  });

  it('anything else: not saved', () => {
    expect(readStandingsAnswer(200, { success: false })).toEqual(notSaved);
    expect(readStandingsAnswer(200, null)).toEqual(notSaved);
    expect(readStandingsAnswer(401, { message: 'Unauthenticated.' })).toEqual(
      notSaved,
    );
    expect(
      readStandingsAnswer(500, { success: false, message: 'Tekstas.' }),
    ).toEqual(notSaved);
    expect(readStandingsAnswer(422, { errors: 'none' })).toEqual(notSaved);
  });
});

describe('posting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sent = (init: RequestInit | undefined): string =>
    init?.body instanceof URLSearchParams ? init.body.toString() : '';

  const answering = (status: number, body: unknown) => {
    const fetch = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(Response.json(body, { status })));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };

  it("a row goes to the save path under sportbet's names, its answer read", async () => {
    const fetch = answering(200, { success: true });
    expect(
      await postStandingsRow({
        team: '411',
        place: 2,
        playOffs: true,
        finalFour: false,
        finalPlace: null,
      }),
    ).toEqual({ kind: 'saved' });
    expect(fetch).toHaveBeenCalledOnce();
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/prediction/standings/save');
    expect(init?.method).toBe('POST');
    expect(sent(init)).toBe(
      'teamID=411&groupPosition=2&quarterfinal=1&semifinal=0&final=',
    );
  });

  it('an order goes to the reorder path as order[], top first', async () => {
    const fetch = answering(422, {
      success: false,
      message: 'Eilė nesutampa su jūsų lentele.',
    });
    expect(await postStandingsOrder(['412', '411'])).toEqual({
      kind: 'refused',
      message: 'Eilė nesutampa su jūsų lentele.',
    });
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/prediction/standings/reorder');
    expect(sent(init)).toBe('order%5B%5D=412&order%5B%5D=411');
  });

  it('a lost connection or a body that is not JSON: not saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect(await postStandingsOrder(['411'])).toEqual(notSaved);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 }))),
    );
    expect(await postStandingsOrder(['411'])).toEqual(notSaved);
  });
});
