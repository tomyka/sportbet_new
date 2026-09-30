import { getTableName, sql } from 'drizzle-orm';
import type { Executor } from './client';
import { players } from './player/schema';
import { survivalPoints } from './points/schema';
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
  survivalPoints,
] as const;

/**
 * Moves each identity sequence past the highest id its table holds, so an
 * id the database generates later never collides with one saved under its
 * own id (`overridingSystemValue`, spec 2.2: sportbet's ids are kept).
 */
export async function advanceIdentitySequences(
  db: Executor,
  tables: readonly (typeof IDENTITY_TABLES)[number][] = IDENTITY_TABLES,
): Promise<void> {
  for (const table of tables) {
    await db.execute(
      sql`select setval(pg_get_serial_sequence(${getTableName(table)}, 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`,
    );
  }
}
