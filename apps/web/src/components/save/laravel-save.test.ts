import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fieldErrorsSchemaFor,
  postSave,
  refusalSchema,
  refusedMessage,
  SAVE_NOT_SAVED,
} from './laravel-save';

// Laravel's answers to an autosave, written once for every save the pages
// make (the prediction save, the standings saves): each save keeps only
// its own field names and its saved body.

const fields = fieldErrorsSchemaFor(['homeTeamScore', 'awayTeamScore']);

describe('the shared shapes', () => {
  it("a refusal: sportbet's {success: false, message}", () => {
    expect(
      refusalSchema.safeParse({ success: false, message: 'Tekstas.' }).success,
    ).toBe(true);
    expect(refusalSchema.safeParse({ success: false }).success).toBe(false);
    expect(
      refusalSchema.safeParse({ success: true, message: 'x' }).success,
    ).toBe(false);
  });

  it("field errors: Laravel's message and errors, under the save's own field names only", () => {
    expect(
      fields.safeParse({
        message: 'Įveskite abu rezultatus.',
        errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
      }).success,
    ).toBe(true);
    expect(
      fields.safeParse({ message: 'x', errors: { teamID: ['x'] } }).success,
    ).toBe(false);
  });
});

describe('refusedMessage (R-59)', () => {
  it("a 422 for the fields: the first field's first message", () => {
    expect(
      refusedMessage(
        422,
        {
          message: 'A. (and 1 more error)',
          errors: { homeTeamScore: ['A.'], awayTeamScore: ['B.'] },
        },
        fields,
      ),
    ).toBe('A.');
  });

  it("a 422 for the fields with no message listed: Laravel's summary", () => {
    expect(
      refusedMessage(422, { message: 'Summary.', errors: {} }, fields),
    ).toBe('Summary.');
  });

  it('a 422 refusal, a 429 and a 503: their own message', () => {
    for (const status of [422, 429, 503]) {
      expect(
        refusedMessage(status, { success: false, message: 'Tekstas.' }, fields),
      ).toBe('Tekstas.');
    }
  });

  it('anything else is no refusal the page can show: null', () => {
    expect(
      refusedMessage(200, { success: false, message: 'x' }, fields),
    ).toBeNull();
    expect(
      refusedMessage(401, { message: 'Unauthenticated.' }, fields),
    ).toBeNull();
    expect(
      refusedMessage(500, { success: false, message: 'x' }, fields),
    ).toBeNull();
    expect(refusedMessage(422, { errors: 'none' }, fields)).toBeNull();
    expect(refusedMessage(429, null, fields)).toBeNull();
  });
});

describe('postSave', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const read = (status: number, body: unknown) => ({ status, body });

  it('posts the form as JSON is asked for, and reads the status and body', async () => {
    const fetch = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(Response.json({ success: true }, { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    const body = new URLSearchParams({ a: '1' });
    expect(await postSave('/x/save', body, read)).toEqual({
      status: 200,
      body: { success: true },
    });
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/x/save');
    expect(init).toEqual({
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
    });
  });

  it('a body that is not JSON is read as null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 500 }))),
    );
    expect(await postSave('/x', new URLSearchParams(), read)).toEqual({
      status: 500,
      body: null,
    });
  });

  it('a lost connection: "Spėjimas neišsaugotas. Bandykite dar kartą."', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect(await postSave('/x', new URLSearchParams(), read)).toEqual({
      kind: 'refused',
      message: SAVE_NOT_SAVED,
    });
    expect(SAVE_NOT_SAVED).toBe('Spėjimas neišsaugotas. Bandykite dar kartą.');
  });
});
