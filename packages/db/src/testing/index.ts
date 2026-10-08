// Test-only entry point (`@sportbet/db/testing`): the test database's whole
// life, for the db suite and web's feature suite alike, a second database
// migrated only part of the way, for the migration tests, and the proof that
// a CHECK holds the same invariant as the domain. Never imported by runtime
// code; lint enforces that (eslint.config.mjs).
export {
  startTestDatabase,
  useTestDatabase,
  type TestDatabase,
  type TestDatabaseConnection,
} from './database';
export { describeInvariantCheck } from './invariant-check';
export {
  migrateThrough,
  withDatabaseAt,
  type DatabaseAtMigration,
} from './migrated-database';
