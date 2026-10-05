import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { openPending, sealPending } from './pending';

const SECRET = 'test-secret-test-secret-test-secret';
const PENDING = {
  email: unwrap(emailAddress('jonas@example.lt')),
  sentAt: at('2026-10-05T12:00:00Z'),
};

/** A minute after the code went out. */
const NOW = at('2026-10-05T12:01:00Z');

describe('the pending sign-in cookie', () => {
  it('opens to what was sealed', () => {
    expect(openPending(sealPending(PENDING, SECRET), SECRET, NOW)).toEqual(
      PENDING,
    );
  });

  it('opens to nothing when changed, sealed with another key, or not one at all', () => {
    const sealed = sealPending(PENDING, SECRET);
    const [body = '', signature = ''] = sealed.split('.');
    const forged = `${Buffer.from(
      JSON.stringify({
        email: 'other@example.lt',
        sentAt: '2026-10-05T12:00:00Z',
      }),
    ).toString('base64url')}.${signature}`;
    expect(openPending(forged, SECRET, NOW)).toBeNull();
    const altered = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(openPending(`${body}.${altered}`, SECRET, NOW)).toBeNull();
    expect(openPending(sealed, `${SECRET}-other`, NOW)).toBeNull();
    expect(openPending('nonsense', SECRET, NOW)).toBeNull();
    expect(openPending(undefined, SECRET, NOW)).toBeNull();
  });

  // Review W5: it holds the address and the time, and nothing that steers
  // where the sign-in ends.
  it('holds the address typed and when the code went out, and nothing else', () => {
    const [body = ''] = sealPending(PENDING, SECRET).split('.');
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).toEqual(
      {
        email: 'jonas@example.lt',
        sentAt: '2026-10-05T12:00:00Z',
      },
    );
  });

  // #18 review W2: the seal is the server's own expiry, as Max-Age is the browser's.
  it("opens to nothing once older than the cookie's two hours, whatever the browser kept", () => {
    const sealed = sealPending(PENDING, SECRET);
    expect(openPending(sealed, SECRET, at('2026-10-05T14:00:00Z'))).toEqual(
      PENDING,
    );
    expect(openPending(sealed, SECRET, at('2026-10-05T14:00:01Z'))).toBeNull();
  });
});
