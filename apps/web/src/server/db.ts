import { createDb, type Db } from '@sportbet/db';
import { env } from '../env';

let db: Db | undefined;

/** One connection pool per server process. */
export function getDb(): Db {
  db ??= createDb(env().DATABASE_URL).db;
  return db;
}
