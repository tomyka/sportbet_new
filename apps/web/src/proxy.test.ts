import { describe, expect, it } from 'vitest';
import { forwardedHeaders } from './proxy';
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
