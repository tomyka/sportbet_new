import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  readonly db: Db;
  close(): Promise<void>;
}

export function createDb(url: string): DbHandle {
  const pool = new pg.Pool({
    connectionString: url,
    // A connection attempt that cannot complete fails instead of hanging a request.
    connectionTimeoutMillis: 5_000,
  });
  // An idle client whose server went away emits 'error' on the pool; without a
  // listener that is an uncaught exception and the whole process dies.
  pool.on('error', (error) => {
    console.error('database pool: idle client error', error);
  });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}

/** Resolves if the database answers a trivial query; rejects otherwise. */
export async function ping(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
