import {
  DAY_SECONDS,
  SESSION_LIFETIME_DAYS,
  type Instant,
} from '@sportbet/domain';

/** A cookie's flags, as this app sets every one of its cookies. */
export interface CookieOptions {
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly maxAge: number;
}

/** One of the app's cookies: its name, and the flags and lifetime it is always set with. */
export interface AppCookie {
  readonly name: string;
  readonly options: CookieOptions;
}

/** What reads a cookie: Next's cookies(), or a request's. */
export interface CookieReader {
  get(name: string): { readonly value: string } | undefined;
}

/** What sets one: Next's cookies() in an action or route, or a response's. */
export interface CookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown;
}

/** #16: `__Host-`, so Secure, host-only and on '/'; HttpOnly and SameSite=Lax. */
const FLAGS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** The signed-in player's session: its token and the day it was last re-issued (session/session.ts); R-44's 90 days. */
export const SESSION_COOKIE: AppCookie = {
  name: '__Host-sb_session',
  options: { ...FLAGS, maxAge: SESSION_LIFETIME_DAYS * DAY_SECONDS },
};

/**
 * A code in flight (sign-in/pending.ts): two hours, sportbet's session
 * lifetime, which held login_code_email.
 */
export const PENDING_COOKIE: AppCookie = {
  name: '__Host-sb_signin',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};

/**
 * /login's and /register's "open the dialog" for the next page
 * (sportbet's `auth_dialog` flash): `login` or `register`, the tab to open
 * on, for 60 seconds. proxy.ts turns it into OPEN_SIGN_IN_HEADER for that
 * page and clears it on the page's response, so no script needs it.
 */
export const OPEN_SIGN_IN_COOKIE: AppCookie = {
  name: '__Host-sb_signin_open',
  options: { ...FLAGS, maxAge: 60 },
};

/** The request header proxy.ts sets from OPEN_SIGN_IN_COOKIE, for the layout's one render. */
export const OPEN_SIGN_IN_HEADER = 'x-sportbet-open-sign-in';

/**
 * A registration waiting for its code (server/register/pending-registration.ts):
 * two hours, sportbet's session lifetime, which held registration_pending.
 */
export const PENDING_REGISTRATION_COOKIE: AppCookie = {
  name: '__Host-sb_register',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};

/**
 * The tournament a guest arrived to join, from /login's or /register's
 * `?tournament=` (server/register/intended.ts): two hours, as sportbet's
 * session held intended_tournament. Read by registration only.
 */
export const INTENDED_TOURNAMENT_COOKIE: AppCookie = {
  name: '__Host-sb_intended',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};

/**
 * A one-time message for the next page (sportbet's `->with('info' |
 * 'error', ...)` flash; server/flash.ts): sealed, for 60 seconds.
 * proxy.ts turns it into FLASH_HEADER for that page and clears it on the
 * page's response, as it does OPEN_SIGN_IN_COOKIE.
 */
export const FLASH_COOKIE: AppCookie = {
  name: '__Host-sb_flash',
  options: { ...FLAGS, maxAge: 60 },
};

/** The request header proxy.ts sets from FLASH_COOKIE, for the page's one render. */
export const FLASH_HEADER = 'x-sportbet-flash';

/**
 * Where sign-in returns to (sportbet's `url.intended`, which
 * `redirect()->intended` reads; server/sign-in/return-path.ts): a path on
 * this site, for two hours, sportbet's session lifetime. Separate from
 * INTENDED_TOURNAMENT_COOKIE, as sportbet's two session keys are.
 */
export const RETURN_COOKIE: AppCookie = {
  name: '__Host-sb_return',
  options: { ...FLAGS, maxAge: 2 * 60 * 60 },
};

/**
 * Whether a value written at `since` is still within its cookie's Max-Age
 * at `now`: a sealed value's own expiry on the server, since a browser (or
 * anyone replaying the value) need not drop it (#18 review W2).
 */
export function withinMaxAge(
  cookie: AppCookie,
  since: Instant,
  now: Instant,
): boolean {
  return now - since <= cookie.options.maxAge * 1000;
}

export function readCookie(
  jar: CookieReader,
  cookie: AppCookie,
): string | undefined {
  return jar.get(cookie.name)?.value;
}

export function setCookie(
  jar: CookieWriter,
  cookie: AppCookie,
  value: string,
): void {
  jar.set(cookie.name, value, cookie.options);
}

/**
 * Clears a cookie: its own flags with Max-Age 0. Never cookies().delete(),
 * whose Set-Cookie drops Secure, which a browser then refuses for a
 * `__Host-` name, leaving the cookie in place.
 */
export function clearCookie(jar: CookieWriter, cookie: AppCookie): void {
  jar.set(cookie.name, '', { ...cookie.options, maxAge: 0 });
}
