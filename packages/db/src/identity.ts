import { getTableName, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from './client';
import { players } from './player/schema';
import { games, rounds } from './season/schema';
import { teams } from './team/schema';
import { tournaments } from './tournament/schema';

/** Every table whose id is an identity column that keeps sportbet's ids. */
export const IDENTITY_TABLES = [
  tournaments,
  rounds,
  teams,
  games,
  players,
] as const;

const serialSequence = z.tuple([
  z.object({
    // pg_get_serial_sequence's schema-qualified name, quoted only where
    // needed; ours are plain lower-case names.
    sequence: z.string().regex(/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/),
  }),
]);

/**
 * Moves each identity sequence past the highest id its table holds, so an
 * id the database generates later never collides with one saved under its
 * own id (`overridingSystemValue`, spec 2.2: sportbet's ids are kept). It
 * only ever moves a sequence forward: past the higher of the table's
 * highest id and the sequence's own position, so ids handed out before
 * (rows since deleted, or a transaction rolled back) are never handed out
 * again.
 *
 * Each table is locked (SHARE ROW EXCLUSIVE: no concurrent insert, update
 * or delete) before its highest id is read, inside a transaction this
 * function opens - a savepoint when `db` is already a transaction. On a
 * live database, call it inside the transaction that saved the ids, as
 * loadMapped does: the locks are then held until that transaction commits,
 * so no insert can take a generated id between the read and the commit.
 */
export async function advanceIdentitySequences(
  db: Executor,
  tables: readonly (typeof IDENTITY_TABLES)[number][] = IDENTITY_TABLES,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of tables) {
      await tx.execute(sql`lock table ${table} in share row exclusive mode`);
      const found = await tx.execute(
        sql`select pg_get_serial_sequence(${getTableName(table)}, 'id') as sequence`,
      );
      const [{ sequence }] = serialSequence.parse(found.rows);
      // The sequence's position is the last id it handed out: last_value
      // once called, the one before it while a setval(..., false) waits.
      await tx.execute(
        sql`select setval(${sequence}::regclass, greatest(
          coalesce((select max(id) from ${table}), 0),
          (select case when is_called then last_value else last_value - 1 end from ${sql.raw(sequence)})
        ) + 1, false)`,
      );
    }
  });
}
