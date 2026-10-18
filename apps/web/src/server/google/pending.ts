import { instantFrom, type Instant } from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../clock';
import {
  clearCookie,
  GOOGLE_COOKIE,
  readCookie,
  setCookie,
  withinMaxAge,
  type CookieReader,
  type CookieWriter,
} from '../cookies';
import { seal, unseal } from '../sealed';

/**
 * The trip to Google as this browser holds it (GOOGLE_COOKIE): the `state`
 * that must come back, the `nonce` the id_token must carry, the PKCE
 * verifier, and when it began. Nothing about a person: the cookie is the
 * browser binding that stops login CSRF.
 */
export interface PendingGoogle {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly at: Instant;
}

/** What the seal is for: a flash or a sign-in's value never opens as this. */
const PURPOSE = 'google-oauth';

const payloadSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  verifier: z.string().min(1),
  at: z.string(),
});

/** Starts the trip: the cookie, sealed under AUTH_SECRET (server/sealed.ts), for ten minutes. */
export function mintPending(
  jar: CookieWriter,
  pending: Omit<PendingGoogle, 'at'>,
  secret: string,
  now: Instant,
): void {
  setCookie(
    jar,
    GOOGLE_COOKIE,
    seal(PURPOSE, { ...pending, at: isoSecond(now) }, secret),
  );
}

/**
 * The trip this browser began, or null for a cookie that is missing, forged,
 * sealed for another purpose or key, malformed, or older than its Max-Age at
 * `now`: the callback asks Google nothing until this is one.
 */
export function readPending(
  jar: CookieReader,
  secret: string,
  now: Instant,
): PendingGoogle | null {
  const payload = payloadSchema.safeParse(
    unseal(PURPOSE, readCookie(jar, GOOGLE_COOKIE), secret),
  );
  if (!payload.success) return null;
  const at = instantFrom(payload.data.at);
  if (!at.ok || !withinMaxAge(GOOGLE_COOKIE, at.value, now)) return null;
  return { ...payload.data, at: at.value };
}

/** Forgets the trip, with the cookie's own flags and Max-Age 0: on every callback outcome, so a replay finds nothing. */
export function clearPending(jar: CookieWriter): void {
  clearCookie(jar, GOOGLE_COOKIE);
}
