import { afterEach, describe, expect, it, vi } from 'vitest';
import { postedBody } from '../../../tests/support/fetch-calls';
import { postPayment, readPaymentsAnswer } from './payments-post';

const SAVED = {
  saved: true,
  collected: '20.00',
  expected: '40.00',
  collectedCents: 2000,
  expectedCents: 4000,
  paidCount: 1,
  memberCount: 2,
};

describe('readPaymentsAnswer', () => {
  it('reads the totals in cents from a 200', () => {
    expect(readPaymentsAnswer(200, SAVED)).toEqual({
      kind: 'saved',
      totals: { collected: 2000, expected: 4000, paidCount: 1, memberCount: 2 },
    });
  });

  it.each([
    [422, { message: 'The paid.5 field must be at least 0.' }],
    [401, { message: 'Unauthenticated.' }],
    [500, null],
    [200, { saved: true }],
    [200, { ...SAVED, collectedCents: -1 }],
    [200, { ...SAVED, collectedCents: 1.5 }],
    [200, null],
  ])('reads %i %j as not saved', (status, body) => {
    expect(readPaymentsAnswer(status, body).kind).toBe('refused');
  });
});

describe('postPayment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts paid[<id>]=<text> to the league's save address asking for JSON", async () => {
    const fetchMock =
      vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(Response.json(SAVED));
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await postPayment(9)(5, '12,5');
    expect(outcome.kind).toBe('saved');
    const [path, init] = fetchMock.mock.calls[0] ?? ['', {}];
    expect(path).toBe('/leagues/9/payments/save');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
    expect(postedBody(init)).toBe('paid%5B5%5D=12%2C5');
  });

  it('a lost connection is not saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect((await postPayment(9)(5, '1')).kind).toBe('refused');
  });
});
