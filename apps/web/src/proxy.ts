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

/**
 * Before every page and action: R-44's once-a-day extension of the
 * sign-in (extendSession), and /login's and /register's open-the-dialog cookie (its tab) turned into
 * a header for this one request and cleared on its response. A cookie
 * cleared here is cleared for the render too, so the layout reads the
 * header (sign-in/dialog.ts); one a client sends itself is dropped. A
 * one-time message (FLASH_COOKIE) goes the same way: forwarded as
 * FLASH_HEADER, still sealed, and cleared, so it shows on one page only;
 * one a client sends as a header itself is dropped.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const opening = readCookie(request.cookies, OPEN_SIGN_IN_COOKIE);
  const flash = readCookie(request.cookies, FLASH_COOKIE);
  const headers = new Headers(request.headers);
  headers.delete(OPEN_SIGN_IN_HEADER);
  headers.delete(FLASH_HEADER);
  // The tab it names, as sent: the dialog reads it (sign-in/dialog.ts).
  if (opening !== undefined) headers.set(OPEN_SIGN_IN_HEADER, opening);
  // Still sealed: the page opens it (server/flash.ts).
  if (flash !== undefined) headers.set(FLASH_HEADER, flash);
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
