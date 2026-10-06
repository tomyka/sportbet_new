import { describe, expect, it } from 'vitest';
import {
  forbidden,
  notFound,
  refuseCrossSite,
  seeOther,
} from './route-responses';

// The route handlers' answers: a real 303 after every write (proxy.ts
// then reads the next page's message), and the same-origin POST guard
// (#16).

describe('route responses', () => {
  it('seeOther: a 303 to the location, with no body', async () => {
    const response = seeOther('/tournament/x');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/tournament/x');
    expect(await response.text()).toBe('');
  });

  it('notFound and forbidden: a bare 404 and 403', () => {
    expect(notFound().status).toBe(404);
    expect(forbidden().status).toBe(403);
  });

  it('refuseCrossSite: a 403 for a request from another site, nothing for this one', () => {
    const from = (headers: Record<string, string>) =>
      new Request('https://sportbet.example/x', { method: 'POST', headers });
    expect(
      refuseCrossSite(
        from({ origin: 'https://evil.example', host: 'sportbet.example' }),
      )?.status,
    ).toBe(403);
    expect(refuseCrossSite(from({ host: 'sportbet.example' }))?.status).toBe(
      403,
    );
    expect(
      refuseCrossSite(
        from({ origin: 'https://sportbet.example', host: 'sportbet.example' }),
      ),
    ).toBeNull();
  });
});
