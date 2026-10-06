import { slugSchema } from '@sportbet/domain';
import {
  clearCookie,
  readCookie,
  RETURN_COOKIE,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';

/** An origin no request has: the path is resolved against it, then must stay on it. */
const HERE = 'https://sportbet.invalid';

const MAX_LENGTH = 2000;

const BACKSLASH = 0x5c;

/** A control character or a backslash: each is one UTF-16 unit, so units are read. */
const hasUnsafeCharacter = (text: string): boolean => {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === BACKSLASH) return true;
  }
  return false;
};

/**
 * #16's hardened check for sportbet's `redirect()->intended`: a path on
 * this site, as a browser will resolve it. It must start with one '/',
 * hold no control character or backslash, and - after the URL parser has
 * removed dot segments, encoded dots included - still be on this origin
 * and start with neither '//' nor '/\' ('/.//evil.example',
 * '/a/..//evil.example' and '/%2e%2e//evil.example' all resolve to
 * '//evil.example'). The resolved path and query are what is kept.
 */
export function safeReturnPath(
  typed: string | null | undefined,
): string | null {
  if (typed === null || typed === undefined) return null;
  if (typed.length === 0 || typed.length > MAX_LENGTH) return null;
  if (!typed.startsWith('/') || hasUnsafeCharacter(typed)) return null;
  let url: URL;
  try {
    url = new URL(typed, HERE);
  } catch {
    return null;
  }
  if (url.origin !== HERE) return null;
  const path = `${url.pathname}${url.search}`;
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}

/** The tournament registration form: a guarded page, its slug checked too. */
const REGISTER_FORM = /^\/tournament\/([^/?#]+)\/register$/u;

/**
 * The prediction pages, behind sportbet's `auth`: the list, at one round
 * (its id) or every round (R-58), and one game - the reminder mail's link.
 * Ids are whole numbers from 1, at most ten digits; no other query.
 */
const PREDICTION_PAGES: readonly RegExp[] = [
  /^\/prediction\/results(?:\?event=(?:all|[1-9]\d{0,9}))?$/u,
  /^\/prediction\/game\/[1-9]\d{0,9}$/u,
];

/** A tournament's registration form: the page a guest is sent back to, in REGISTER_FORM's shape. */
export const registerPath = (slug: string): string =>
  `/tournament/${slug}/register`;

function isGuardedPage(typed: string): boolean {
  const slug = REGISTER_FORM.exec(typed)?.[1];
  if (slug !== undefined) return slugSchema.safeParse(slug).success;
  return PREDICTION_PAGES.some((page) => page.test(typed));
}

/**
 * Security review M1: the return path is only the shape of a page that
 * sends a guest to sign in - the tournament registration form
 * (`/tournament/<slug>/register`, the slug valid) or a prediction page
 * (slice 6) - so a link from another site cannot make sign-in end anywhere
 * else on this one (an action such as /tournaments/exit or the save
 * included). safeReturnPath checks it again behind that, and must keep it
 * as typed.
 */
export function guardedReturnPath(
  typed: string | null | undefined,
): string | null {
  if (typed === null || typed === undefined) return null;
  if (!isGuardedPage(typed)) return null;
  return safeReturnPath(typed) === typed ? typed : null;
}

/**
 * /login's `?intended=`: the guarded page a guest was sent from (the
 * tournament registration form, a prediction page), kept only if guardedReturnPath accepts
 * it; with anything else, a path kept before is forgotten (security
 * review L2), so a stale or planted one never outlives the /login that
 * did not name it.
 */
export function rememberReturn(jar: CookieWriter, typed: string | null): void {
  const path = guardedReturnPath(typed);
  if (path === null) forgetReturn(jar);
  else setCookie(jar, RETURN_COOKIE, path);
}

/** The path sign-in returns to, checked again as it is read. */
export function readReturn(jar: CookieReader): string | null {
  return guardedReturnPath(readCookie(jar, RETURN_COOKIE));
}

/** Forgets it, for a /login that names no guarded page; a session begun or ended forgets it itself (session.ts). */
export function forgetReturn(jar: CookieWriter): void {
  clearCookie(jar, RETURN_COOKIE);
}
