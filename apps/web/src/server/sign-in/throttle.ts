import { createHash } from 'node:crypto';
import { attemptRateLimit, type Executor } from '@sportbet/db';
import {
  throttledMinutes,
  type Instant,
  type ThrottleLimit,
} from '@sportbet/domain';

/** What rate_limits holds of a key: its SHA-256, so no address is stored there. */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export type ThrottleVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly minutes: number };

/**
 * Laravel's ThrottleRequests::handleRequest: each limit in turn is checked
 * and then hit; the first already at its maximum refuses, and those before
 * it have counted the attempt. The limits are the domain's
 * (codeRequestLimits, codeVerifyLimits: the IP's first), and so are the
 * minutes (throttledMinutes); the key's hash is this app's.
 */
export async function throttle(
  db: Executor,
  limits: readonly ThrottleLimit[],
  now: Instant,
): Promise<ThrottleVerdict> {
  for (const limit of limits) {
    const verdict = await attemptRateLimit(db, {
      key: hashKey(limit.key),
      maxAttempts: limit.maxAttempts,
      windowSeconds: limit.windowSeconds,
      now,
    });
    if (!verdict.allowed) {
      return {
        allowed: false,
        minutes: throttledMinutes(verdict.retryAfterSeconds),
      };
    }
  }
  return { allowed: true };
}
