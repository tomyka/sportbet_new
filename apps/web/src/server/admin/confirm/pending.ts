import {
  confirmableActionSchema,
  instantFrom,
  playerId,
  type ConfirmableAction,
  type Instant,
  type PlayerId,
} from '@sportbet/domain';
import { z } from 'zod';
import { isoSecond } from '../../clock';
import {
  clearCookie,
  CONFIRM_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
  withinMaxAge,
} from '../../cookies';
import { seal, unseal } from '../../sealed';

/**
 * A destructive action waiting for its emailed code (R-26 amended): the
 * account that asked, what it asked for and when the code went out. A
 * signed cookie, as the sign-in's pending step is; the code itself never
 * leaves the server. At most one action is pending per browser, and the
 * code of the account is voided by the next one issued, so a code can only
 * ever confirm the action the cookie names.
 */
export interface PendingConfirmation {
  readonly account: PlayerId;
  readonly action: ConfirmableAction;
  readonly issuedAt: Instant;
}

/** What the seal is for: a confirmation's value never opens as any other cookie's. */
const PURPOSE = 'admin-confirm';

const payloadSchema = z.object({
  account: z.string(),
  action: confirmableActionSchema,
  issuedAt: z.string(),
});

/** The cookie's value, sealed under AUTH_SECRET (server/sealed.ts). */
export function sealConfirmation(
  pending: PendingConfirmation,
  secret: string,
): string {
  return seal(
    PURPOSE,
    {
      account: pending.account,
      action: pending.action,
      issuedAt: isoSecond(pending.issuedAt),
    },
    secret,
  );
}

/**
 * The pending confirmation, or null for a cookie that is missing, forged,
 * sealed for another purpose, naming an action this app does not have, or
 * older than its Max-Age at `now`.
 */
export function openConfirmation(
  value: string | undefined,
  secret: string,
  now: Instant,
): PendingConfirmation | null {
  const payload = payloadSchema.safeParse(unseal(PURPOSE, value, secret));
  if (!payload.success) return null;
  const account = playerId(payload.data.account);
  const issuedAt = instantFrom(payload.data.issuedAt);
  if (!account.ok || !issuedAt.ok) return null;
  if (!withinMaxAge(CONFIRM_COOKIE, issuedAt.value, now)) return null;
  return {
    account: account.value,
    action: payload.data.action,
    issuedAt: issuedAt.value,
  };
}

/** This browser's pending confirmation, if its cookie is one this app sealed. */
export function readConfirmation(
  jar: CookieReader,
  secret: string,
  now: Instant,
): PendingConfirmation | null {
  return openConfirmation(readCookie(jar, CONFIRM_COOKIE), secret, now);
}

export function writeConfirmation(
  jar: CookieWriter,
  pending: PendingConfirmation,
  secret: string,
): void {
  setCookie(jar, CONFIRM_COOKIE, sealConfirmation(pending, secret));
}

/** Forgets the pending action: confirmed, or abandoned. */
export function clearConfirmation(jar: CookieWriter): void {
  clearCookie(jar, CONFIRM_COOKIE);
}
