import { instantFrom, type Instant } from '@sportbet/domain';
import { headers } from 'next/headers';
import { z } from 'zod';
import { env } from '../env';
import { isoSecond, now } from './clock';
import {
  FLASH_COOKIE,
  FLASH_HEADER,
  setCookie,
  withinMaxAge,
  type CookieWriter,
} from './cookies';
import { seal, unseal } from './sealed';

/** What the seal is for: a message's value never opens as another cookie's. */
const PURPOSE = 'flash';

/**
 * The one-time messages sportbet flashes (`->with('info' | 'error', ...)`),
 * by kind - the one definition: the texts are FlashAlert's (decision 13),
 * and a value of any other kind opens as nothing.
 */
export const flashSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('registered'), tournament: z.string() })
    .readonly(),
  z.object({ kind: z.literal('registration-closed') }).readonly(),
  z.object({ kind: z.literal('confirm-required') }).readonly(),
  z.object({ kind: z.literal('recalculated') }).readonly(),
]);

export type Flash = z.infer<typeof flashSchema>;

const payloadSchema = z.object({ flash: flashSchema, at: z.string() });

/** The cookie's value: the message and when it was written, sealed under AUTH_SECRET. */
export function sealFlash(flash: Flash, at: Instant, secret: string): string {
  return seal(PURPOSE, { flash, at: isoSecond(at) }, secret);
}

/** The message, or null for a value missing, forged, sealed for another purpose, of an unknown kind, or past its minute at `now`. */
export function openFlash(
  value: string | null | undefined,
  secret: string,
  now: Instant,
): Flash | null {
  const payload = payloadSchema.safeParse(
    unseal(PURPOSE, value ?? undefined, secret),
  );
  if (!payload.success) return null;
  const at = instantFrom(payload.data.at);
  if (!at.ok || !withinMaxAge(FLASH_COOKIE, at.value, now)) return null;
  return payload.data.flash;
}

/** Leaves a message for the next page (a route handler's response). */
export function writeFlash(
  jar: CookieWriter,
  flash: Flash,
  at: Instant,
  secret: string,
): void {
  setCookie(jar, FLASH_COOKIE, sealFlash(flash, at, secret));
}

/** The message proxy.ts handed this render (FLASH_HEADER), if any. */
export async function readFlash(): Promise<Flash | null> {
  return openFlash(
    (await headers()).get(FLASH_HEADER),
    env().AUTH_SECRET,
    now(),
  );
}
