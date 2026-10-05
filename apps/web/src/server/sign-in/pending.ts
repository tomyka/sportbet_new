import {
  instantFrom,
  storedEmailAddress,
  type EmailAddress,
  type Instant,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import {
  clearCookie,
  PENDING_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
  withinMaxAge,
} from '../cookies';
import { seal, unseal } from '../sealed';

/**
 * A code in flight (PENDING_COOKIE, cookies.ts): the address the visitor
 * typed and when the code went out - nothing that steers where the
 * sign-in ends (review W5). A signed cookie, not session state (decision
 * 5); the code itself never leaves the server.
 */
export interface PendingSignIn {
  readonly email: EmailAddress;
  readonly sentAt: Instant;
}

/** What the seal is for: a sign-in's value never opens as a registration's. */
const PURPOSE = 'sign-in';

const payloadSchema = z.object({
  email: z.string(),
  sentAt: z.string(),
});

/** The cookie's value, sealed under AUTH_SECRET (server/sealed.ts). */
export function sealPending(pending: PendingSignIn, secret: string): string {
  return seal(
    PURPOSE,
    { email: pending.email, sentAt: isoSecond(pending.sentAt) },
    secret,
  );
}

/** The pending sign-in, or null for a cookie that is missing, forged, not this app's, or older than its Max-Age at `now`. */
export function openPending(
  value: string | undefined,
  secret: string,
  now: Instant,
): PendingSignIn | null {
  const payload = payloadSchema.safeParse(unseal(PURPOSE, value, secret));
  if (!payload.success) return null;
  const email = storedEmailAddress(payload.data.email);
  const sentAt = instantFrom(payload.data.sentAt);
  if (!email.ok || !sentAt.ok) return null;
  if (!withinMaxAge(PENDING_COOKIE, sentAt.value, now)) return null;
  return { email: email.value, sentAt: sentAt.value };
}

/** This browser's code in flight, if its cookie is one this app sealed. */
export function readPending(
  jar: CookieReader,
  secret: string,
  now: Instant,
): PendingSignIn | null {
  return openPending(readCookie(jar, PENDING_COOKIE), secret, now);
}

export function writePending(
  jar: CookieWriter,
  pending: PendingSignIn,
  secret: string,
): void {
  setCookie(jar, PENDING_COOKIE, sealPending(pending, secret));
}

/** Forgets the code in flight (EmailCodeLoginController::cancel, and a sign-in done). */
export function clearPending(jar: CookieWriter): void {
  clearCookie(jar, PENDING_COOKIE);
}
