import type { Instant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from './client';
import { instantOf } from './edge';

/** The moment a save is judged at, read inside its transaction. */
export type DatabaseClock = (tx: Executor) => Promise<Instant>;

const clockRows = z.array(z.object({ seconds: z.int() }));

/**
 * The database's own clock, rounded up to the second (Instant is to the
 * second): at worst a save is judged up to a second late, never early.
 */
export const databaseClock: DatabaseClock = async (tx) => {
  const [row] = clockRows.parse(
    (
      await tx.execute(
        sql`select ceil(extract(epoch from clock_timestamp()))::double precision as seconds`,
      )
    ).rows,
  );
  if (row === undefined) {
    throw new Error('databaseClock: the database gave no time');
  }
  return instantOf(new Date(row.seconds * 1000), 'clock', 'now');
};

/**
 * The moment a save is judged at: the later of `now` (the call) and the
 * database's time read once the save's locks are held, so a save that
 * waited for a lock across a deadline is judged after it, and none is
 * judged before it was made.
 */
export async function judgedAt(
  tx: Executor,
  clock: DatabaseClock,
  now: Instant,
): Promise<Instant> {
  const lockedAt = await clock(tx);
  return lockedAt > now ? lockedAt : now;
}
