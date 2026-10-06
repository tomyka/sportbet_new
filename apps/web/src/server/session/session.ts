import {
  createSession,
  deleteSession,
  findSignedInPlayer,
  touchSession,
  type Executor,
  type SignedInPlayer,
} from '@sportbet/db';
import { utcDay, type Instant, type PlayerId } from '@sportbet/domain';
import {
  clearCookie,
  readCookie,
  RETURN_COOKIE,
  SESSION_COOKIE,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';
import { hashSessionToken, newSessionToken } from './session-token';

/**
 * A signed-in browser's session (review A1): the four things the app does
 * with one, each the cookie, the token's hash and the database together,
 * so no caller repeats them. The cookie holds the token and the UTC day it
 * was last issued; the database holds the token's SHA-256 only.
 */

interface SessionCookie {
  readonly token: string;
  readonly day: string;
}

const VALUE = /^([A-Za-z0-9_-]{43})\.(\d{4}-\d{2}-\d{2})$/;

function readSession(jar: CookieReader): SessionCookie | null {
  const value = readCookie(jar, SESSION_COOKIE);
  const parts = value === undefined ? null : VALUE.exec(value);
  const token = parts?.[1];
  const day = parts?.[2];
  return token === undefined || day === undefined ? null : { token, day };
}

function issue(jar: CookieWriter, token: string, now: Instant): void {
  setCookie(jar, SESSION_COOKIE, `${token}.${utcDay(now)}`);
}

/** Signs a player in on this browser: a new session (none to fixate: a guest has none) and its cookie. */
export async function startSession(
  db: Executor,
  jar: CookieWriter,
  player: PlayerId,
  now: Instant,
): Promise<void> {
  const token = newSessionToken();
  await createSession(db, { player, tokenHash: hashSessionToken(token), now });
  issue(jar, token, now);
}

/** The player this browser's session names, if it is live. */
export async function currentPlayer(
  db: Executor,
  jar: CookieReader,
  now: Instant,
): Promise<SignedInPlayer | null> {
  const cookie = readSession(jar);
  if (cookie === null) return null;
  return (
    (await findSignedInPlayer(db, hashSessionToken(cookie.token), now)) ?? null
  );
}

/**
 * R-44: every visit extends the sign-in. On a visit on a later UTC day than
 * the cookie's, the session runs 90 days from now and the cookie is
 * re-issued for 90 days, so a day of visits costs one write; on the same
 * day nothing is written. A cookie that is not this app's, or whose
 * session has ended, is cleared.
 */
export async function extendSession(
  db: Executor,
  request: CookieReader,
  response: CookieWriter,
  now: Instant,
): Promise<void> {
  if (readCookie(request, SESSION_COOKIE) === undefined) return;
  const cookie = readSession(request);
  if (cookie !== null && cookie.day === utcDay(now)) return;
  const live =
    cookie !== null &&
    (await touchSession(db, hashSessionToken(cookie.token), now));
  if (cookie !== null && live) issue(response, cookie.token, now);
  else clearCookie(response, SESSION_COOKIE);
}

/**
 * Signs this browser out (Q3: this device only): its session deleted, its
 * cookie cleared, and any return path left from a sign-in with it, so the
 * next one does not inherit it (security review L2).
 */
export async function endSession(
  db: Executor,
  request: CookieReader,
  response: CookieWriter,
): Promise<void> {
  const cookie = readSession(request);
  if (cookie !== null) {
    await deleteSession(db, hashSessionToken(cookie.token));
  }
  clearCookie(response, SESSION_COOKIE);
  clearCookie(response, RETURN_COOKIE);
}
