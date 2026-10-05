import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { openPending, sealPending } from './pending';

const SECRET = 'test-secret-test-secret-test-secret';
const PENDING = {
  email: unwrap(emailAddress('jonas@example.lt')),
  sentAt: at('2026-10-05T12:00:00Z'),
};

describe('the pending sign-in cookie', () => {
  it('opens to what was sealed', () => {
    expect(openPending(sealPending(PENDING, SECRET), SECRET)).toEqual(PENDING);
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
    expect(openPending(forged, SECRET)).toBeNull();
    const altered = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(openPending(`${body}.${altered}`, SECRET)).toBeNull();
    expect(openPending(sealed, `${SECRET}-other`)).toBeNull();
    expect(openPending('nonsense', SECRET)).toBeNull();
    expect(openPending(undefined, SECRET)).toBeNull();
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
});
