import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client';

export { MIGRATIONS_FOLDER, runMigrations } from './migrations';

/** The Postgres image every test suite runs on; staging's Compose file pins the same. */
export const POSTGRES_IMAGE = 'postgres:18';

const tableNames = z.array(z.object({ name: z.string() }));

/** Empties every table in `public`, so each test starts from nothing. */
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
