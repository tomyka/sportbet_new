import { changeRole } from '@sportbet/db';
import { isSuperadmin, type PlayerId, type Role } from '@sportbet/domain';
import { ADMIN_USERS_PATH } from '../../../components/admin/admin-paths';
import { ROLE_LABEL } from '../../../components/admin/role-labels';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { HOME, said, type AdminAnswer } from '../admin-answer';
import { findUser } from './delete-user';
import type { Performer } from './performer';

/** R-26 amended: only a superadmin gives or takes a role. */
export const changeRolePermission = isSuperadmin;

/** What the confirmation page says will happen: the account, the role it holds now and the one it will hold. */
export const changeRoleText = (
  username: string,
  from: Role,
  to: Role,
): string =>
  `Pakeisti ${username} rolę: ${ROLE_LABEL[from]} -> ${ROLE_LABEL[to]}`;

/** What the mail says: the account's number and the new role, words this app wrote. */
export const changeRoleMailText = (player: PlayerId, to: Role): string =>
  `Pakeisti paskyros #${player} rolę į: ${ROLE_LABEL[to]}`;

/**
 * The confirmed change (R-26 amended, R-117): decided again under every
 * superadmin's lock (changeRole), whatever the page showed - the actor's role
 * read again, yourself, the same role and the last superadmin refused - and
 * recorded with it. The target's session reads the role again on its next
 * request.
 */
export async function performChangeRole(
  target: PlayerId,
  role: Role,
  { admin, at }: Performer,
): Promise<AdminAnswer> {
  const user = await findUser(target);
  if (user === null) return said(ADMIN_USERS_PATH, 'account-gone');
  const changed = await changeRole(getDb(), {
    actor: admin,
    target,
    role,
    now: at,
  });
  if (changed.ok) {
    return said(ADMIN_USERS_PATH, 'user-updated', { name: user.username });
  }
  switch (changed.refusal) {
    case 'actor-not-superadmin':
      return HOME;
    case 'no-such-account':
      return said(ADMIN_USERS_PATH, 'account-gone');
    case 'last-superadmin':
      return said(ADMIN_USERS_PATH, 'last-superadmin-role');
    case 'own-role':
    case 'same-role':
      return said(ADMIN_USERS_PATH, changed.refusal);
  }
}
