import { describe, expect, it } from 'vitest';
import {
  clearCookie,
  INTENDED_TOURNAMENT_COOKIE,
  OPEN_SIGN_IN_COOKIE,
  PENDING_COOKIE,
  PENDING_REGISTRATION_COOKIE,
  readCookie,
  SESSION_COOKIE,
  setCookie,
  type CookieOptions,
} from './cookies';

const COOKIE_FLAGS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** A cookie jar as Next's cookies() and a response's cookies are, in memory. */
function jar() {
  const values = new Map<string, string>();
  const written: { name: string; value: string; options: CookieOptions }[] = [];
  return {
    written,
    get: (name: string) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string, options: CookieOptions) => {
      values.set(name, value);
      written.push({ name, value, options });
    },
  };
}

// #16: every cookie is __Host- (Secure, host-only, on '/'), HttpOnly and
// SameSite=Lax, its lifetime set explicitly.
describe("the app's cookies", () => {
  it('the session: 90 days (R-44)', () => {
    expect(SESSION_COOKIE).toEqual({
      name: '__Host-sb_session',
      options: { ...COOKIE_FLAGS, maxAge: 90 * 86_400 },
    });
  });

  it("the pending sign-in: two hours, sportbet's session lifetime, which held login_code_email", () => {
    expect(PENDING_COOKIE).toEqual({
      name: '__Host-sb_signin',
      options: { ...COOKIE_FLAGS, maxAge: 7200 },
    });
  });

  it("/login's open-the-dialog: 60 seconds, and HttpOnly too: only the server reads and clears it", () => {
    expect(OPEN_SIGN_IN_COOKIE).toEqual({
      name: '__Host-sb_signin_open',
      options: { ...COOKIE_FLAGS, maxAge: 60 },
    });
  });
});

describe('setting, reading and clearing one', () => {
  it('sets it with its own flags, and reads it back', () => {
    const cookies = jar();
    setCookie(cookies, PENDING_COOKIE, 'sealed');
    expect(readCookie(cookies, PENDING_COOKIE)).toBe('sealed');
    expect(cookies.written).toEqual([
      {
        name: '__Host-sb_signin',
        value: 'sealed',
        options: PENDING_COOKIE.options,
      },
    ]);
  });

  it('clears it with its own flags and Max-Age 0, never a bare delete that drops Secure', () => {
    const cookies = jar();
    clearCookie(cookies, SESSION_COOKIE);
    expect(cookies.written).toEqual([
      {
        name: '__Host-sb_session',
        value: '',
        options: { ...SESSION_COOKIE.options, maxAge: 0 },
      },
    ]);
  });
});

describe('the registration cookies (spec 4c)', () => {
  it("the pending registration: two hours, sportbet's session lifetime, which held registration_pending", () => {
    expect(PENDING_REGISTRATION_COOKIE).toEqual({
      name: '__Host-sb_register',
      options: { ...COOKIE_FLAGS, maxAge: 7200 },
    });
  });

  it("the tournament a guest arrived to join: two hours, as sportbet's session held intended_tournament", () => {
    expect(INTENDED_TOURNAMENT_COOKIE).toEqual({
      name: '__Host-sb_intended',
      options: { ...COOKIE_FLAGS, maxAge: 7200 },
    });
  });
});
