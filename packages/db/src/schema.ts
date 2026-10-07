import {
  loginCodeInvariantChecks,
  playerSettingsInvariantChecks,
} from './account/schema';
import type { InvariantCheck } from './invariant';
import {
  playerInvariantChecks,
  tournamentPlayerInvariantChecks,
} from './player/schema';
import {
  gameOddsInvariantChecks,
  matchPointsInvariantChecks,
  standingsPointsInvariantChecks,
} from './points/schema';
import {
  auditPredictionInvariantChecks,
  predictionInvariantChecks,
} from './prediction/schema';
import { auditResultInvariantChecks } from './result/schema';
import { gameInvariantChecks, roundInvariantChecks } from './season/schema';
import { standingsInvariantChecks } from './standings/schema';
import { teamInvariantChecks } from './team/schema';
import { tournamentInvariantChecks } from './tournament/schema';

// Every table, for the Drizzle client and for drizzle-kit.
export * from './account/schema';
export * from './player/schema';
export * from './points/schema';
export * from './prediction/schema';
export * from './result/schema';
export * from './season/schema';
export * from './standings/schema';
export * from './survival/schema';
export * from './team/schema';
export * from './tournament/schema';

/**
 * Every area's invariant CHECKs. The db tests prove each one against its
 * domain invariant, and fail on any CHECK in the database missing here.
 */
export const INVARIANT_CHECKS: readonly InvariantCheck[] = [
  ...tournamentInvariantChecks,
  ...roundInvariantChecks,
  ...gameInvariantChecks,
  ...teamInvariantChecks,
  ...playerInvariantChecks,
  ...tournamentPlayerInvariantChecks,
  ...playerSettingsInvariantChecks,
  ...loginCodeInvariantChecks,
  ...predictionInvariantChecks,
  ...auditPredictionInvariantChecks,
  ...auditResultInvariantChecks,
  ...standingsInvariantChecks,
  ...gameOddsInvariantChecks,
  ...matchPointsInvariantChecks,
  ...standingsPointsInvariantChecks,
];
