import { isRegistrationOpen } from '@sportbet/db';
import { ruledRules, type Instant } from '@sportbet/domain';
import { cache } from 'react';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';

/**
 * ChecksRegistrationDeadline::registrationIsOpen() with no tournament: is
 * any tournament taking players (isRegistrationOpen, which reads only what
 * that needs, not whole seasons), under the live rule set - R-8 closes a
 * Euroleague season at its standings deadline.
 */
export async function registrationOpenAt(at: Instant): Promise<boolean> {
  return isRegistrationOpen(getDb(), at, ruledRules);
}

/** The same, once per request, for the layout's dialog (AuthDialogComposer's registrationOpen). */
export const registrationOpenNow = cache((): Promise<boolean> =>
  registrationOpenAt(now()),
);
