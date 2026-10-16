import { findPlayerEmail, type SignedInPlayer } from '@sportbet/db';
import {
  adminConfirmRequestLimits,
  type ConfirmableAction,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { ADMIN_CONFIRM_PATH } from '../../../components/admin/admin-paths';
import { env } from '../../../env';
import { now } from '../../clock';
import { sendEmailedCode } from '../../emailed-code';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { adminConfirmationMail } from '../../mail/admin-confirmation-mail';
import { pruneLater } from '../../sign-in/prune';
import { throttle } from '../../sign-in/throttle';
import { goTo, said, throttledTo, type AdminAnswer } from '../admin-answer';
import { describeAction } from './actions';
import { actionBinding } from './binding';
import { writeConfirmation } from './pending';

/**
 * The first step of a destructive superadmin action (R-26 amended), asked
 * only once the action's own route has checked the role and that the
 * domain allows it now (so a refused action sends no mail): throttled -
 * five codes per ten minutes per account, so `back` says for how long - then
 * a fresh code for the admin's own address under the `admin_action` purpose,
 * bound to the action (`actionBinding`) and voiding the earlier code, so at
 * most one code is live per admin and it confirms only this action, mailed after the response naming the action in words (what the
 * action's own description says for a mail), the action
 * sealed in the confirmation cookie, and on to the page that asks for the
 * code. Nothing is logged of the address or the code.
 */
export async function requestConfirmation(input: {
  readonly admin: SignedInPlayer;
  readonly action: ConfirmableAction;
  readonly back: string;
}): Promise<AdminAnswer> {
  const { admin, action, back } = input;
  const db = getDb();
  const at = now();
  const verdict = await throttle(
    db,
    adminConfirmRequestLimits(admin.player),
    at,
  );
  if (!verdict.allowed) return throttledTo(back, verdict.minutes);
  const described = await describeAction(action, admin.player);
  if (described === null) return said(back, 'nothing-to-confirm');
  const email = await findPlayerEmail(db, admin.player);
  if (email === undefined) {
    throw new Error(
      'requestConfirmation: the signed-in account has no address',
    );
  }
  after(async () => {
    await sendEmailedCode({
      email,
      now: at,
      purpose: 'admin_action',
      binding: actionBinding(action),
      mail: (to, code) => adminConfirmationMail(to, code, described.mail),
    });
  });
  pruneLater(db, at);
  writeConfirmation(
    await cookies(),
    { account: admin.player, action, issuedAt: at },
    env().AUTH_SECRET,
  );
  return goTo(ADMIN_CONFIRM_PATH);
}
