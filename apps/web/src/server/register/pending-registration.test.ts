import { emailAddress } from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { sealPending } from '../sign-in/pending';
import {
  fitsInCookie,
  openRegistration,
  sealRegistration,
  type PendingRegistration,
} from './pending-registration';

const SECRET = 'test-secret-test-secret-test-secret';
const PENDING: PendingRegistration = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: unwrap(emailAddress('ruta.naujoke@example.lt')),
  tournament: 'euroleague-2026-27',
  sentAt: at('2026-10-05T12:00:00Z'),
};

/** A minute after the code went out. */
const NOW = at('2026-10-05T12:01:00Z');

describe('the pending registration cookie', () => {
  it('opens to what was sealed', () => {
    expect(
      openRegistration(sealRegistration(PENDING, SECRET), SECRET, NOW),
    ).toEqual(PENDING);
    const none = { ...PENDING, tournament: null };
    expect(
      openRegistration(sealRegistration(none, SECRET), SECRET, NOW),
    ).toEqual(none);
  });

  it("opens to nothing when sealed with another key, or as a sign-in's", () => {
    expect(
      openRegistration(
        sealRegistration(PENDING, SECRET),
        `${SECRET}-other`,
        NOW,
      ),
    ).toBeNull();
    expect(
      openRegistration(
        sealPending({ email: PENDING.email, sentAt: PENDING.sentAt }, SECRET),
        SECRET,
        NOW,
      ),
    ).toBeNull();
    expect(openRegistration(undefined, SECRET, NOW)).toBeNull();
  });

  it('holds the answers, the slug and when the code went out, and nothing else', () => {
    const [body = ''] = sealRegistration(PENDING, SECRET).split('.');
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).toEqual(
      {
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        email: 'ruta.naujoke@example.lt',
        tournament: 'euroleague-2026-27',
        sentAt: '2026-10-05T12:00:00Z',
      },
    );
  });

  it("fits a browser's 4,096 bytes, unless the names are long in four-byte characters (plan decision 13)", () => {
    const longest = 'ž'.repeat(255);
    expect(
      fitsInCookie(
        { ...PENDING, username: longest, name: longest, surname: longest },
        SECRET,
      ),
    ).toBe(true);
    const wide = '\u{1F600}'.repeat(255);
    expect(
      fitsInCookie(
        { ...PENDING, username: wide, name: wide, surname: wide },
        SECRET,
      ),
    ).toBe(false);
  });

  // #18 review W2: the seal is the server's own expiry, as Max-Age is the browser's.
  it("opens to nothing once older than the cookie's two hours, whatever the browser kept", () => {
    const sealed = sealRegistration(PENDING, SECRET);
    expect(
      openRegistration(sealed, SECRET, at('2026-10-05T14:00:00Z')),
    ).toEqual(PENDING);
    expect(
      openRegistration(sealed, SECRET, at('2026-10-05T14:00:01Z')),
    ).toBeNull();
  });
});
