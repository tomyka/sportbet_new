import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from '../shared/result';

/**
 * R-26 (amended, 2026-10-07): the roles an account holds - a player, a
 * results manager (results, the standings facts, the recalculation), a
 * superadmin (everything).
 */
export const ROLES = ['player', 'results-manager', 'superadmin'] as const;

export type Role = (typeof ROLES)[number];

const ADMIN_LEVEL_MAX = 127;

/**
 * sportbet's `user_settings.admin`, carried as it is: a signed tinyint its
 * admin form fills with 0, 1, 5, 8 or 9 (UserController::updateUser). The
 * CHECK holds the column's non-negative range, so no stored level is
 * refused; the reader maps it to a role (roleOfSportbetLevel, R-26
 * amended).
 */
export const adminLevelInvariant = defineRangeInvariant({
  name: 'admin level',
  min: 0,
  max: ADMIN_LEVEL_MAX,
  accepts: [
    { label: 'a player', value: 0 },
    { label: "sportbet's top level", value: 9 },
    { label: 'the tinyint maximum', value: ADMIN_LEVEL_MAX },
  ],
  refuses: [
    { label: 'negative', value: -1 },
    { label: 'past the tinyint', value: ADMIN_LEVEL_MAX + 1 },
  ],
});

/**
 * sportbet's `user_settings.admin` as a role (R-26 amended): 0 a player;
 * 1 to 7 a results manager (its admin form offers 1 and 5 - AdminMiddleware
 * lets in level > 0, SuperAdminMiddleware >= 5); 8 and up a superadmin (8
 * and 9 are the owner's: 8 promoted itself to 9 for the dangerous work).
 */
export function roleOfSportbetLevel(
  level: number,
): Result<Role, 'bad-admin-level'> {
  if (!adminLevelInvariant.schema.safeParse(level).success) {
    return refuse('bad-admin-level');
  }
  if (level === 0) return ok('player');
  return ok(level >= 8 ? 'superadmin' : 'results-manager');
}

/** The shell's admin link, and R-50's "an admin sees a hidden tournament": any role but a player. */
export function isAdmin(role: Role): boolean {
  return role !== 'player';
}

/** R-26 amended: enters results ("Rezultatai"). */
export function mayEnterResults(role: Role): boolean {
  return role !== 'player';
}

/** R-26 amended, R-65: runs "Perskaičiuoti taškus". */
export function mayRecalculate(role: Role): boolean {
  return role !== 'player';
}
