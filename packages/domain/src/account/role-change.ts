import { idFromText, playerId, type PlayerId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { isSuperadmin, ROLES, type Role } from './role';

/** An account and the role it holds now, as the writer re-read it under its locks. */
export interface RoleHolder {
  readonly player: PlayerId;
  readonly role: Role;
}

/** A role change decided: who, and from which role to which. */
export interface RoleChange {
  readonly player: PlayerId;
  readonly from: Role;
  readonly to: Role;
}

export type RoleChangeRefusal =
  'actor-not-superadmin' | 'own-role' | 'same-role' | 'last-superadmin';

/**
 * R-26 amended: only a superadmin gives or takes a role, on an existing
 * account; nobody changes their own role (not even to the role they hold:
 * sportbet's `promoteSelf` is gone); the last superadmin cannot be removed.
 * `actor` and `target` are read under the superadmin rows' locks and
 * `superadmins` is every account that is a superadmin then, so two
 * superadmins demoting each other cannot both pass. Refused in this order:
 * the actor, the own account, the same role, the last superadmin. (The
 * entry's unknown role, `roleChangeEntry`, is refused before any of them.)
 * `last-superadmin` is reachable here only for a target other than the
 * actor: a superadmin is never the last one while acting.
 */
export function roleChange(input: {
  readonly actor: RoleHolder;
  readonly target: RoleHolder;
  readonly role: Role;
  readonly superadmins: readonly PlayerId[];
}): Result<RoleChange, RoleChangeRefusal> {
  const { actor, target, role, superadmins } = input;
  if (!isSuperadmin(actor.role)) return refuse('actor-not-superadmin');
  if (actor.player === target.player) return refuse('own-role');
  if (target.role === role) return refuse('same-role');
  const others = superadmins.filter((each) => each !== target.player);
  if (isSuperadmin(target.role) && others.length === 0) {
    return refuse('last-superadmin');
  }
  return ok({ player: target.player, from: target.role, to: role });
}

/** A posted field of the role form, by sportbet's name (`UserController::updateUser`). */
export type RoleChangeField = 'admin' | 'userID';

/** `required`, or the rule it fails: `in` on the role, `integer` on the account. */
export interface RoleChangeFieldError {
  readonly field: RoleChangeField;
  readonly problem: 'required' | 'not-a-role' | 'not-an-integer';
}

export type RoleChangeFormCheck =
  | {
      readonly ok: true;
      readonly value: { readonly target: PlayerId; readonly role: Role };
    }
  | { readonly ok: false; readonly errors: readonly RoleChangeFieldError[] };

/**
 * The posted values, as the route read them: a string, or anything else when
 * the post was not a plain field (`userID[]=1` is an array). Blank, absent
 * and null are "not posted".
 */
export interface RoleChangeFields {
  readonly admin: unknown;
  readonly userID: unknown;
}

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

const roleOf = (value: unknown): Role | undefined =>
  ROLES.find((role) => role === value);

function roleRead(
  value: unknown,
): { readonly role: Role } | RoleChangeFieldError {
  if (isBlank(value)) return { field: 'admin', problem: 'required' };
  const role = roleOf(value);
  return role === undefined
    ? { field: 'admin', problem: 'not-a-role' }
    : { role };
}

/** `required|integer`, read only by idFromText: an array or a cast never names an account (issue 281). */
function targetRead(
  value: unknown,
): { readonly target: PlayerId } | RoleChangeFieldError {
  if (isBlank(value)) return { field: 'userID', problem: 'required' };
  const id = typeof value === 'string' ? idFromText(value) : null;
  const target = id?.ok === true ? playerId(String(id.value)) : null;
  return target?.ok === true
    ? { target: target.value }
    : { field: 'userID', problem: 'not-an-integer' };
}

const isError = (
  read:
    | { readonly role: Role }
    | { readonly target: PlayerId }
    | RoleChangeFieldError,
): read is RoleChangeFieldError => 'field' in read;

/**
 * UserController::updateUser's validation on the posted fields, with the
 * role in place of the level (`in` the three roles, R-26 amended): `admin`,
 * then `userID`, every failing field listed as Laravel reports them.
 */
export function roleChangeEntry(fields: RoleChangeFields): RoleChangeFormCheck {
  const role = roleRead(fields.admin);
  const target = targetRead(fields.userID);
  if (isError(role) || isError(target)) {
    return { ok: false, errors: [role, target].filter(isError) };
  }
  return { ok: true, value: { target: target.target, role: role.role } };
}
