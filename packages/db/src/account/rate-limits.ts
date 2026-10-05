import { DAY_SECONDS, secondsAfter, type Instant } from '@sportbet/domain';
import { eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loginCodes, rateLimits, sessions } from './schema';

export interface RateLimitAttempt {
  /** The limit's key, hashed by the caller: no address is stored. */
  readonly key: string;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
  readonly now: Instant;
}

export type RateLimitVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

const windowRows = z.array(
  z.object({ windowStartedAt: z.date(), hits: z.int() }),
);

/**
 * One attempt against one limit, as Laravel's ThrottleRequests makes it
 * (tooManyAttempts, then hit): refused, uncounted, while the window holds
 * the maximum; otherwise counted, a lapsed window starting afresh at
 * `now`. The row is locked for the decision, so racing attempts take
 * turns and never pass the maximum.
 */
export async function attemptRateLimit(
  db: Executor,
  attempt: RateLimitAttempt,
): Promise<RateLimitVerdict> {
  const now = new Date(attempt.now);
  return db.transaction(async (tx) => {
    await tx
      .insert(rateLimits)
      .values({ key: attempt.key, windowStartedAt: now, hits: 0 })
      .onConflictDoNothing({ target: rateLimits.key });
    const [row] = windowRows.parse(
      await tx
        .select({
          windowStartedAt: rateLimits.windowStartedAt,
          hits: rateLimits.hits,
        })
        .from(rateLimits)
        .where(eq(rateLimits.key, attempt.key))
        .for('update'),
    );
    if (row === undefined) {
      throw new Error('rate_limits: the window just ensured is missing');
    }
    const endsAt = row.windowStartedAt.getTime() + attempt.windowSeconds * 1000;
    const lapsed = endsAt <= attempt.now;
    const hits = lapsed ? 0 : row.hits;
    if (hits >= attempt.maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.floor((endsAt - attempt.now) / 1000),
      };
    }
    await tx
      .update(rateLimits)
      .set({
        windowStartedAt: lapsed ? now : row.windowStartedAt,
        hits: hits + 1,
      })
      .where(eq(rateLimits.key, attempt.key));
    return { allowed: true };
  });
}

/**
 * Deletes what sign-in no longer needs: throttle windows and login codes
 * more than a day old, and sessions that have ended. Run after each code
 * request (Task 15), never in its answer.
 */
export async function pruneSignInState(
  db: Executor,
  now: Instant,
): Promise<void> {
  const dayAgo = new Date(secondsAfter(now, -DAY_SECONDS));
  await db.delete(rateLimits).where(lt(rateLimits.windowStartedAt, dayAgo));
  await db.delete(loginCodes).where(lt(loginCodes.expiresAt, dayAgo));
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now)));
}
