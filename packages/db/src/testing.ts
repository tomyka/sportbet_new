import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client';

export { MIGRATIONS_FOLDER, runMigrations } from './migrations';

/**
 * The Postgres image every test suite runs on; staging's Compose file
 * (infra/compose/app.yml) and infra/host/backup.sh pin the same exact tag,
 * bumped deliberately together with the node tag in the Dockerfile.
 */
export const POSTGRES_IMAGE = 'postgres:18.6';

const tableNames = z.array(z.object({ name: z.string() }));

/**
 * Empties every table in `public` of whatever database `db` is connected to,
 * with CASCADE, so each test starts from nothing. This is destructive and
 * unscoped by design: `db` must only ever be a test container's connection,
 * never a staging or production database.
 */
export async function truncateAll(db: Db): Promise<void> {
  const result = await db.execute(
    sql`select format('%I.%I', schemaname, tablename) as name from pg_tables where schemaname = 'public'`,
  );
  const names = tableNames.parse(result.rows).map((row) => row.name);
  if (names.length === 0) return;
  await db.execute(
    sql.raw(`truncate table ${names.join(', ')} restart identity cascade`),
  );
}
