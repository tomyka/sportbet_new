import { deleteAccount, findAdminUser, type AdminUser } from '@sportbet/db';
import { isSuperadmin, type PlayerId } from '@sportbet/domain';
import { ADMIN_USERS_PATH } from '../../../components/admin/admin-paths';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { pointsChanged } from '../../points-changed';
import { HOME, said, type AdminAnswer } from '../admin-answer';
import type { Performer } from './performer';

/** R-26 amended: an account is deleted by a superadmin only. */
export const deleteUserPermission = isSuperadmin;

/** The account as the users list shows it, or null once it is gone. */
export const findUser = (player: PlayerId): Promise<AdminUser | null> =>
  findAdminUser(getDb(), player);

/** What the confirmation page says will happen: the account and its address, which only a superadmin sees (the owner's consent, slice 4b). React escapes both. */
export const deleteUserText = (user: AdminUser): string =>
  `Ištrinti paskyrą ${user.username} (${user.email})`;

/** What the mail says: the account's number only - no name or address of anyone's reaches an email's markup. */
export const deleteUserMailText = (player: PlayerId): string =>
  `Ištrinti paskyrą #${player}`;

/**
 * The confirmed deletion (R-25): decided again under the superadmins' locks
 * (deleteAccount), whatever the page showed - the actor's role read again,
 * yourself and the last superadmin refused. No recalculation (R-99); who the
 * tables list changes, so the cached boards go (pointsChanged).
 */
export async function performDeleteUser(
  target: PlayerId,
  { admin, at }: Performer,
): Promise<AdminAnswer> {
  const user = await findUser(target);
  if (user === null) return said(ADMIN_USERS_PATH, 'account-gone');
  const deleted = await deleteAccount(getDb(), {
    target,
    by: { admin },
    now: at,
  });
  if (!deleted.ok) {
    switch (deleted.refusal) {
      case 'actor-not-superadmin':
        return HOME;
      case 'no-such-account':
        return said(ADMIN_USERS_PATH, 'account-gone');
      case 'own-account':
      case 'last-superadmin':
        return said(ADMIN_USERS_PATH, deleted.refusal);
      case 'code-spent':
        // Only a self-deletion carries a code to spend.
        throw new Error('performDeleteUser: code-spent without a code');
    }
  }
  pointsChanged();
  return said(ADMIN_USERS_PATH, 'user-deleted', { name: user.username });
}
