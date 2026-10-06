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

/**
 * /login's `?intended=`: the guarded page a guest was sent from (the
 * tournament registration form), kept only if safeReturnPath accepts it;
 * anything else is not kept, and a path kept before stays.
 */
export function rememberReturn(jar: CookieWriter, typed: string | null): void {
  const path = safeReturnPath(typed);
  if (path !== null) setCookie(jar, RETURN_COOKIE, path);
}

/** The path sign-in returns to, checked again as it is read. */
export function readReturn(jar: CookieReader): string | null {
  return safeReturnPath(readCookie(jar, RETURN_COOKIE));
}

/** Forgets it: sign-in has used it. */
export function forgetReturn(jar: CookieWriter): void {
  clearCookie(jar, RETURN_COOKIE);
}
