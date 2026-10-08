import { refuse, type Result } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { TransactionRollbackError } from 'drizzle-orm/errors';
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

/**
 * The one shape of a save that loads what it judges under its locks
 * (writing as it loads, e.g. seeding missing rows), then decides in the
 * domain: one saveTransaction in which `load` locks and reads, `decide`
 * judges what was loaded, and `write` stores an accepted decision. Nothing
 * loaded is the `unloaded` refusal; a refusal, or nothing loaded, rolls
 * the whole transaction back - whatever `load` wrote included - so a
 * refused save writes nothing.
 */
export async function decideUnderLock<T, V, R extends string>(
  db: Executor,
  steps: {
    readonly load: (tx: Tx) => Promise<T | null>;
    readonly unloaded: R;
    readonly decide: (loaded: T) => Result<V, R>;
    readonly write: (tx: Tx, decided: V) => Promise<void>;
  },
): Promise<Result<V, R>> {
  let refused: Result<V, R> | undefined;
  try {
    return await saveTransaction(db, async (tx) => {
      const loaded = await steps.load(tx);
      const decided: Result<V, R> =
        loaded === null ? refuse(steps.unloaded) : steps.decide(loaded);
      if (decided.ok) {
        await steps.write(tx, decided.value);
        return decided;
      }
      refused = decided;
      tx.rollback();
      return decided;
    });
  } catch (error) {
    if (refused !== undefined && error instanceof TransactionRollbackError) {
      return refused;
    }
    throw error;
  }
}
