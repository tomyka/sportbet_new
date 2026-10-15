import { isAdmin } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../../env';
import { now } from '../../clock';
import { adminGate } from '../gate';
import { describeAction, permissionOf } from './actions';
import { readConfirmation } from './pending';

/** What /admin/confirm shows: the action waiting for its code, or where to go instead. */
export type ConfirmPage =
  | { readonly kind: 'ask'; readonly description: string }
  | { readonly kind: 'home' }
  | { readonly kind: 'dashboard' };

/**
 * The page of the emailed confirmation (R-26 amended): for the role the
 * pending action's own permission names (any admin when none is pending),
 * else home; shows the action only when the cookie names this account and
 * what it names is still there to act on - anything else goes to the
 * dashboard, with nothing to confirm.
 */
export async function loadConfirmPage(): Promise<ConfirmPage> {
  const pending = readConfirmation(await cookies(), env().AUTH_SECRET, now());
  const admin = await adminGate(
    pending === null ? isAdmin : permissionOf(pending.action),
  );
  if (admin === null) return { kind: 'home' };
  if (pending?.account !== admin.player) return { kind: 'dashboard' };
  const description = await describeAction(pending.action, admin.player);
  return description === null
    ? { kind: 'dashboard' }
    : { kind: 'ask', description: description.page };
}
