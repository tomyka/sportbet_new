import type { InvariantCheck } from './invariant';
import { tournamentInvariantChecks } from './tournament/schema';

// Every table, for the Drizzle client and for drizzle-kit.
export * from './tournament/schema';

/**
 * Every area's invariant CHECKs. The db tests prove each one against its
 * domain invariant, and fail on any CHECK in the database missing here.
 */
export const INVARIANT_CHECKS: readonly InvariantCheck[] = [
  ...tournamentInvariantChecks,
];
