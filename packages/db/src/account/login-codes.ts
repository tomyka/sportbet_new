import {
  loginCodeExpiresAt,
  type EmailAddress,
  type Instant,
  type LoginCodePurpose,
} from '@sportbet/domain';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loginCodes } from './schema';

export interface NewLoginCode {
  readonly email: EmailAddress;
  readonly purpose: LoginCodePurpose;
  /** The code's slow hash; the code itself never reaches the database. */
  readonly codeHash: string;
  readonly now: Instant;
}

/** A code that can still be redeemed: its id, to claim it, and its hash, to check it. */
export interface LiveLoginCode {
  readonly id: number;
  readonly codeHash: string;
}

const liveRows = z.array(z.object({ id: z.int(), codeHash: z.string() }));

/**
 * OneTimeCodeService::issue: in one transaction, voids every unconsumed
 * code of exactly this address and purpose (#41, #43), then stores the new
 * one, live for five minutes. An advisory lock on the address and purpose
 * makes two issues at once take turns, so at most one code is live.
 */
export async function issueLoginCode(
  db: Executor,
  code: NewLoginCode,
): Promise<void> {
  const now = new Date(code.now);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`login_codes:${code.purpose}:${code.email}`}, 0))`,
    );
    await tx
      .update(loginCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(loginCodes.email, code.email),
          eq(loginCodes.purpose, code.purpose),
          isNull(loginCodes.consumedAt),
        ),
      );
    await tx.insert(loginCodes).values({
      email: code.email,
      purpose: code.purpose,
      codeHash: code.codeHash,
      createdAt: now,
      expiresAt: new Date(loginCodeExpiresAt(code.now)),
    });
  });
}

/** OneTimeCodeService::findLive: the newest unconsumed, unexpired code of exactly this address and purpose. */
export async function findLiveLoginCode(
  db: Executor,
  email: EmailAddress,
  purpose: LoginCodePurpose,
  now: Instant,
): Promise<LiveLoginCode | undefined> {
  const rows = await db
    .select({ id: loginCodes.id, codeHash: loginCodes.codeHash })
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.email, email),
        eq(loginCodes.purpose, purpose),
        isNull(loginCodes.consumedAt),
        gt(loginCodes.expiresAt, new Date(now)),
      ),
    )
    .orderBy(desc(loginCodes.id))
    .limit(1);
  return liveRows.parse(rows)[0];
}

/**
 * OneTimeCodeService::claim: consumes the code if it is still unconsumed
 * and unexpired, in one statement, so of two racing verifies (or a verify
 * racing the code's expiry) exactly one wins. True for the winner.
 */
export async function claimLoginCode(
  db: Executor,
  id: number,
  now: Instant,
): Promise<boolean> {
  const at = new Date(now);
  const claimed = await db
    .update(loginCodes)
    .set({ consumedAt: at })
    .where(
      and(
        eq(loginCodes.id, id),
        isNull(loginCodes.consumedAt),
        gt(loginCodes.expiresAt, at),
      ),
    )
    .returning({ id: loginCodes.id });
  return claimed.length === 1;
}
