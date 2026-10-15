import { isAdmin } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../../../env';
import { answerAdminPost } from '../../../../server/admin/admin-action';
import { permissionOf } from '../../../../server/admin/confirm/actions';
import { confirmPending } from '../../../../server/admin/confirm/check';
import { readConfirmation } from '../../../../server/admin/confirm/pending';
import { now } from '../../../../server/clock';

/**
 * The emailed confirmation's second step (R-26 amended): from this site
 * only, for the role the pending action's own permission names (any admin
 * when none is pending - confirmPending then says there is nothing to
 * confirm), else home. The code is checked and the action performed by
 * confirmPending (server/admin/confirm/check.ts), a 303 with the
 * performer's message.
 */
export async function POST(request: Request): Promise<Response> {
  const pending = readConfirmation(await cookies(), env().AUTH_SECRET, now());
  return answerAdminPost(
    request,
    pending === null ? isAdmin : permissionOf(pending.action),
    (input) => confirmPending(input, pending),
  );
}
