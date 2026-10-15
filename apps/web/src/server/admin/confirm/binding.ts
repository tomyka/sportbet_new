import { createHash } from 'node:crypto';
import type { ConfirmableAction } from '@sportbet/domain';

/**
 * What an emailed confirmation code is bound to: a digest of the action it
 * confirms, with its fields in name order, so the request (the action the
 * route built) and the check (the action opened from the sealed cookie)
 * compute the same value whatever order their fields came in. A code mailed
 * for one action never confirms another, whichever cookie is presented.
 */
export function actionBinding(action: ConfirmableAction): string {
  const fields = Object.entries(action).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
