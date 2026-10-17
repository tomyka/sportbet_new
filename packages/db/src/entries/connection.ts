// Narrow entry `@sportbet/db/connection` (#36): The database connection and the settings it reads: no table is loaded.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  createDb,
  ping,
  type Db,
  type DbHandle,
  type Executor,
  type Tx,
} from '../client';
export { databaseEnvSchema, databaseUrlSchema } from '../config';
