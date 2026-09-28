// Test-only entry point (`@sportbet/db/testing`): the test database's whole
// life, for the db suite and web's feature suite alike, and the proof that
// a CHECK holds the same invariant as the domain. Never imported by runtime
// code; lint enforces that (eslint.config.js).
export {
  startTestDatabase,
  useTestDatabase,
  type TestDatabase,
  type TestDatabaseConnection,
} from './database';
export { describeInvariantCheck } from './invariant-check';
