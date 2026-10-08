import { NextResponse, type NextRequest } from 'next/server';
import { now } from './server/clock';
import {
  clearCookie,
  FLASH_COOKIE,
  FLASH_HEADER,
  OPEN_SIGN_IN_COOKIE,
  OPEN_SIGN_IN_HEADER,
  readCookie,
} from './server/cookies';
import { getDb } from './server/db';
import { extendSession } from './server/session/session';

/** The tabs /login and /register open the dialog on. */
const DIALOG_TABS: ReadonlySet<string> = new Set(['login', 'register']);

/** A sealed value as server/sealed.ts writes one: base64url body, a dot, base64url signature. */
const SEALED_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

/**
 * A browser's speculative load (Sec-Purpose or Purpose: prefetch): not the
 * page being opened. Next's own router prefetch cannot be told here - its
 * adapter strips `rsc` and `next-router-prefetch` before the proxy runs
 * (next/dist/server/web/adapter.js) - nor can it take a message: only a
 * 303 sets one, and the browser follows it at once with a page load.
 */
function isPrefetch(headers: Headers): boolean {
  return (headers.get('sec-purpose') ?? headers.get('purpose') ?? '').includes(
    'prefetch',
  );
}

/**
 * The request's headers for the render: the dialog's tab and the one-time
 * message each carried on only in the shape the server writes; the same
 * headers a client sent itself, never.
 */
export function forwardedHeaders(
  sent: Headers,
  cookies: {
    readonly opening: string | undefined;
    readonly flash: string | undefined;
  },
): Headers {
  const { opening, flash } = cookies;
  const headers = new Headers(sent);
  headers.delete(OPEN_SIGN_IN_HEADER);
  headers.delete(FLASH_HEADER);
  // The tab it names: the dialog reads it (sign-in/dialog.ts).
  if (opening !== undefined && DIALOG_TABS.has(opening)) {
    headers.set(OPEN_SIGN_IN_HEADER, opening);
  }
  // Still sealed: the page opens it (server/flash.ts).
  if (flash !== undefined && SEALED_SHAPE.test(flash)) {
    headers.set(FLASH_HEADER, flash);
  }
  return headers;
}

/**
 * Before every page and action: R-44's once-a-day extension of the
 * sign-in (extendSession), and /login's and /register's open-the-dialog cookie (its tab) turned into
 * a header for this one request and cleared on its response. A cookie
 * cleared here is cleared for the render too, so the layout reads the
 * header (sign-in/dialog.ts); one a client sends itself is dropped. A
 * one-time message (FLASH_COOKIE) goes the same way: forwarded as
 * FLASH_HEADER, still sealed, and cleared, so it shows on one page only;
 * one a client sends as a header itself is dropped. A prefetch leaves the
 * message for the page actually opened.
 *
 * Each value is forwarded only in the shape the server writes (security
 * review L3): a tab name, a sealed value's two base64url parts. Anything
 * else a client put in the cookie is dropped (and still cleared), so it
 * can neither reach the render nor break the request: a header value that
 * decodes to a line break throws.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const opening = readCookie(request.cookies, OPEN_SIGN_IN_COOKIE);
  const flash = isPrefetch(request.headers)
    ? undefined
    : readCookie(request.cookies, FLASH_COOKIE);
  const headers = forwardedHeaders(request.headers, { opening, flash });
  const response = NextResponse.next({ request: { headers } });
  await extendSession(getDb(), request.cookies, response.cookies, now());
  if (opening !== undefined) clearCookie(response.cookies, OPEN_SIGN_IN_COOKIE);
  if (flash !== undefined) clearCookie(response.cookies, FLASH_COOKIE);
  return response;
}

export const config = {
  // Every page and action; not Next's own files, sportbet's images or the health check.
  matcher: ['/((?!_next/static|_next/image|img/|favicon|api/health).*)'],
};
