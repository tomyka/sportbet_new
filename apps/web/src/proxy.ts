import { NextResponse, type NextRequest } from 'next/server';
import { now } from './server/clock';
import {
  clearCookie,
  OPEN_SIGN_IN_COOKIE,
  OPEN_SIGN_IN_HEADER,
  readCookie,
} from './server/cookies';
import { getDb } from './server/db';
import { extendSession } from './server/session/session';

/**
 * Before every page and action: R-44's once-a-day extension of the
 * sign-in (extendSession), and /login's open-the-dialog cookie turned into
 * a header for this one request and cleared on its response. A cookie
 * cleared here is cleared for the render too, so the layout reads the
 * header (sign-in/dialog.ts); one a client sends itself is dropped.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const opening =
    readCookie(request.cookies, OPEN_SIGN_IN_COOKIE) !== undefined;
  const headers = new Headers(request.headers);
  headers.delete(OPEN_SIGN_IN_HEADER);
  if (opening) headers.set(OPEN_SIGN_IN_HEADER, '1');
  const response = NextResponse.next({ request: { headers } });
  await extendSession(getDb(), request.cookies, response.cookies, now());
  if (opening) clearCookie(response.cookies, OPEN_SIGN_IN_COOKIE);
  return response;
}

export const config = {
  // Every page and action; not Next's own files, sportbet's images or the health check.
  matcher: ['/((?!_next/static|_next/image|img/|favicon|api/health).*)'],
};
