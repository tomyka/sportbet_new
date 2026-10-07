import type { SignedInPlayer } from '@sportbet/db';
import type { Role } from '@sportbet/domain';
import { signedInPlayer } from '../request-context';

/**
 * AdminMiddleware for R-26 (amended), named by the permission it checks:
 * the signed-in player if `permission` (the domain's isAdmin,
 * mayEnterResults, mayRecalculate) holds for their role, else null - a
 * guest without asking. The role is read from the database with the
 * session on every request (sportbet re-reads `user_settings.admin` in
 * each middleware), never kept in a cookie. A page answers null with
 * `redirect('/')`, a route handler with `seeOther('/')` (design
 * decision 2).
 */
export async function adminGate(
  permission: (role: Role) => boolean,
): Promise<SignedInPlayer | null> {
  const signedIn = await signedInPlayer();
  return signedIn !== null && permission(signedIn.role) ? signedIn : null;
}
