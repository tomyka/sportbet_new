import { findPlayerEmail } from '@sportbet/db';
import { adminConfirmCheckLimits } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { ADMIN_CONFIRM_PATH } from '../../../components/admin/admin-paths';
import { ADMIN_PATH } from '../../../components/shell/shell-paths';
import { now } from '../../clock';
import { checkCode } from '../../code-check';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { formText } from '../../request/form-input';
import { throttle } from '../../sign-in/throttle';
import { said, throttledTo, type AdminAnswer } from '../admin-answer';
import type { AdminRequest } from '../admin-action';
import { performAction } from './actions';
import { actionBinding } from './binding';
import { clearConfirmation, type PendingConfirmation } from './pending';
import { workingTournament } from '../working-tournament';

/**
 * The second step (R-26 amended), for an admin the action's own permission
 * has let in (adminGate in the route): the pending action must name this
 * account - any other, expired or missing is "nothing to confirm", and a
 * foreign cookie is cleared; checks are throttled, ten per ten minutes per
 * account; the typed code goes through the shared code check (checkCode,
 * purpose `admin_action`, bound to the cookie's action, the address read now
 * from the account), one
 * answer for every failure, the cookie kept until it expires so the right
 * code can still be typed. A claimed code clears the cookie, then the
 * action is performed for the admin the gate let in (the session's player,
 * their role read again on this request) and the tournament they work on
 * now - never from the cookie - and decides again under its own locks.
 */
export async function confirmPending(
  { admin, form }: AdminRequest,
  pending: PendingConfirmation | null,
): Promise<AdminAnswer> {
  const jar = await cookies();
  if (pending?.account !== admin.player) {
    clearConfirmation(jar);
    return said(ADMIN_PATH, 'nothing-to-confirm');
  }
  const db = getDb();
  const at = now();
  const verdict = await throttle(db, adminConfirmCheckLimits(admin.player), at);
  if (!verdict.allowed) return throttledTo(ADMIN_CONFIRM_PATH, verdict.minutes);
  const email = await findPlayerEmail(db, admin.player);
  const checked =
    email === undefined
      ? 'refused'
      : await checkCode(db, {
          email,
          purpose: 'admin_action',
          code: formText(form, 'code'),
          now: at,
          binding: actionBinding(pending.action),
        });
  if (checked === 'refused') return said(ADMIN_CONFIRM_PATH, 'wrong-code');
  clearConfirmation(jar);
  return performAction(pending.action, {
    admin: admin.player,
    tournament: await workingTournament(admin.player),
    at,
  });
}
