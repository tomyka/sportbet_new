import { sql } from 'drizzle-orm';
import type { Executor, Tx } from './client';

/**
 * A player's save in one transaction (a savepoint when `db` is one) that
 * waits at most 5 s for any lock: past that it fails cleanly (55P03,
 * lock_not_available, answered 503) rather than holding the request open.
 */
export async function saveTransaction<T>(
  db: Executor,
  save: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    return save(tx);
  });
}
