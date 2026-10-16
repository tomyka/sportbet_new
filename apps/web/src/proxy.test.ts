import { describe, expect, it } from 'vitest';
import { config, forwardedHeaders, isDocumentLoad } from './proxy';
import { FLASH_HEADER, OPEN_SIGN_IN_HEADER } from './server/cookies';

// What the proxy hands the render (security review L3): the dialog's tab
// and the one-time message, each only in the shape the server writes;
// whatever a client sent under those headers itself is dropped.

const sent = (headers: Record<string, string> = {}) =>
  new Headers({ accept: 'text/html', ...headers });

describe('forwardedHeaders', () => {
  it("a tab the dialog opens on, and a sealed message, are carried on; the request's own headers kept", () => {
    const headers = forwardedHeaders(sent(), {
      opening: 'register',
      flash: 'Ym9keQ.c2ln',
    });
    expect(headers.get(OPEN_SIGN_IN_HEADER)).toBe('register');
    expect(headers.get(FLASH_HEADER)).toBe('Ym9keQ.c2ln');
    expect(headers.get('accept')).toBe('text/html');
  });

  it('anything else in the cookies is dropped', () => {
    const headers = forwardedHeaders(sent(), {
      opening: 'admin',
      flash: 'not sealed',
    });
    expect(headers.get(OPEN_SIGN_IN_HEADER)).toBeNull();
    expect(headers.get(FLASH_HEADER)).toBeNull();
  });

  it('the same headers sent by a client are never passed on', () => {
    const headers = forwardedHeaders(
      sent({ [OPEN_SIGN_IN_HEADER]: 'login', [FLASH_HEADER]: 'Ym9keQ.c2ln' }),
      { opening: undefined, flash: undefined },
    );
    expect(headers.get(OPEN_SIGN_IN_HEADER)).toBeNull();
    expect(headers.get(FLASH_HEADER)).toBeNull();
  });
});

describe('isDocumentLoad', () => {
  it('a browser navigation is the page being opened', () => {
    expect(isDocumentLoad(sent({ 'sec-fetch-dest': 'document' }))).toBe(true);
  });

  it('a client without Sec-Fetch-Dest counts as one: its message must still show', () => {
    expect(isDocumentLoad(sent())).toBe(true);
  });

  it("a script's fetch - Next's router prefetch from the outgoing page - is not, so it cannot eat the message", () => {
    expect(
      isDocumentLoad(
        sent({ 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' }),
      ),
    ).toBe(false);
  });

  it('other destinations are not', () => {
    for (const dest of ['image', 'manifest', 'iframe', 'script']) {
      expect(isDocumentLoad(sent({ 'sec-fetch-dest': dest }))).toBe(false);
    }
  });

  it("a browser's speculative document load is not", () => {
    expect(
      isDocumentLoad(
        sent({ 'sec-fetch-dest': 'document', 'sec-purpose': 'prefetch' }),
      ),
    ).toBe(false);
    expect(isDocumentLoad(sent({ purpose: 'prefetch' }))).toBe(false);
  });
});

describe('the proxy matcher', () => {
  const [pattern = ''] = config.matcher;
  const runsOn = (path: string): boolean =>
    new RegExp(`^${pattern}$`).test(path);

  it('runs on pages and the unsubscribe page, whose route handler reads the flash it leaves', () => {
    expect(runsOn('/')).toBe(true);
    expect(runsOn('/profile/notifications/unsubscribe/7')).toBe(true);
    expect(runsOn('/profile/notifications/unsubscribe/7/confirm')).toBe(true);
  });

  it("skips Next's files, images, the health check and the cron route: a bearer secret needs no session or flash", () => {
    for (const path of [
      '/_next/static/chunk.js',
      '/_next/image',
      '/img/crest.png',
      '/favicon.ico',
      '/api/health',
      '/api/cron/reminders',
    ]) {
      expect(runsOn(path)).toBe(false);
    }
  });
});
