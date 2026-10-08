import {
  clearCookie,
  readCookie,
  RETURN_COOKIE,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';
import { guardedReturnPath } from './guarded-pages';

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
function forgetReturn(jar: CookieWriter): void {
  clearCookie(jar, RETURN_COOKIE);
}
