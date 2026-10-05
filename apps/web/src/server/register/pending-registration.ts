import type { NewAccount } from '@sportbet/db';
import {
  instantFrom,
  registrationAnswers,
  slugSchema,
  type Instant,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import {
  clearCookie,
  PENDING_REGISTRATION_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
  withinMaxAge,
} from '../cookies';
import { seal, unseal } from '../sealed';

/**
 * A registration waiting for its code (sportbet's session keys
 * registration_pending and registration_sent_at, sportbet issue 102): the
 * answers, the slug /login or /register was given, and when the code went
 * out. No account, settings or tournament place exists until the code
 * comes back, so nothing is left to clean up when it never does.
 */
export interface PendingRegistration extends NewAccount {
  readonly sentAt: Instant;
}

/** What the seal is for: a registration's value never opens as a sign-in's. */
const PURPOSE = 'registration';

const payloadSchema = z.object({
  username: z.string(),
  name: z.string(),
  surname: z.string(),
  email: z.string(),
  tournament: slugSchema.nullable(),
  sentAt: z.string(),
});

/** A browser keeps a cookie of at most 4,096 bytes, name and value together (RFC 6265, 6.1). */
const COOKIE_BYTES = 4096;

export function sealRegistration(
  pending: PendingRegistration,
  secret: string,
): string {
  return seal(
    PURPOSE,
    {
      username: pending.username,
      name: pending.name,
      surname: pending.surname,
      email: pending.email,
      tournament: pending.tournament,
      sentAt: isoSecond(pending.sentAt),
    },
    secret,
  );
}

/**
 * The pending registration, or null for a cookie that is missing, forged
 * or not this app's, or older than its Max-Age at `now`. Its answers are checked again, so only answers step
 * one would accept can ever become an account.
 */
export function openRegistration(
  value: string | undefined,
  secret: string,
  now: Instant,
): PendingRegistration | null {
  const payload = payloadSchema.safeParse(unseal(PURPOSE, value, secret));
  if (!payload.success) return null;
  const { tournament, sentAt, ...typed } = payload.data;
  const answers = registrationAnswers(typed);
  const at = instantFrom(sentAt);
  if (!answers.ok || !at.ok) return null;
  if (!withinMaxAge(PENDING_REGISTRATION_COOKIE, at.value, now)) return null;
  return { ...answers.value, tournament, sentAt: at.value };
}

/** Whether the sealed answers fit a browser's cookie (plan decision 13): the value is base64url, one byte a character. */
export function fitsInCookie(
  pending: PendingRegistration,
  secret: string,
): boolean {
  const value = sealRegistration(pending, secret);
  return (
    PENDING_REGISTRATION_COOKIE.name.length + 1 + value.length <= COOKIE_BYTES
  );
}

/** This browser's registration waiting for its code, if its cookie is one this app sealed. */
export function readPendingRegistration(
  jar: CookieReader,
  secret: string,
  now: Instant,
): PendingRegistration | null {
  return openRegistration(
    readCookie(jar, PENDING_REGISTRATION_COOKIE),
    secret,
    now,
  );
}

export function writePendingRegistration(
  jar: CookieWriter,
  pending: PendingRegistration,
  secret: string,
): void {
  setCookie(
    jar,
    PENDING_REGISTRATION_COOKIE,
    sealRegistration(pending, secret),
  );
}

/** RegisteredUserController::SESSION_KEYS forgotten: cancelled, taken, closed or done. */
export function clearPendingRegistration(jar: CookieWriter): void {
  clearCookie(jar, PENDING_REGISTRATION_COOKIE);
}
