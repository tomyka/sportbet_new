import { createHmac, timingSafeEqual } from 'node:crypto';
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
} from '../cookies';

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

const payloadSchema = z.object({
  email: z.string(),
  sentAt: z.string(),
});

const signatureOf = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64url');

/** The cookie's value: the JSON, base64url, then its HMAC-SHA256 under AUTH_SECRET. */
export function sealPending(pending: PendingSignIn, secret: string): string {
  const body = Buffer.from(
    JSON.stringify({
      email: pending.email,
      sentAt: isoSecond(pending.sentAt),
    }),
  ).toString('base64url');
  return `${body}.${signatureOf(body, secret)}`;
}

function decoded(body: string): unknown {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );
    return value;
  } catch {
    return null;
  }
}

/** The pending sign-in, or null for a cookie that is missing, forged or not this app's. */
export function openPending(
  value: string | undefined,
  secret: string,
): PendingSignIn | null {
  const [body, signature, ...rest] = value?.split('.') ?? [];
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const expected = Buffer.from(signatureOf(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  const payload = payloadSchema.safeParse(decoded(body));
  if (!payload.success) return null;
  const email = storedEmailAddress(payload.data.email);
  const sentAt = instantFrom(payload.data.sentAt);
  if (!email.ok || !sentAt.ok) return null;
  return {
    email: email.value,
    sentAt: sentAt.value,
  };
}

/** This browser's code in flight, if its cookie is one this app sealed. */
export function readPending(
  jar: CookieReader,
  secret: string,
): PendingSignIn | null {
  return openPending(readCookie(jar, PENDING_COOKIE), secret);
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
