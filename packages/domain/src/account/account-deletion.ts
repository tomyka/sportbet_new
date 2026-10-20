import type { LeagueId, LeagueMember } from '../league/league';
import type { TournamentStatusRow } from '../player/player-status';
import type { PlayerId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { isSuperadmin } from './role';
import type { RoleHolder } from './role-change';

/**
 * Who asks for the deletion: the account itself (slice 17's `DELETE
 * /profile`), or an admin, with the role the writer re-read under its locks.
 */
export type DeletionActor = 'self' | { readonly admin: RoleHolder };

export type AccountDeletionRefusal =
  'actor-not-superadmin' | 'own-account' | 'last-superadmin';

/**
 * R-25, R-26 amended: an account is deleted by itself or by a superadmin,
 * never by an admin on their own account here (the profile is the place for
 * that), and never when it is the last superadmin. `target` is read under
 * the superadmin rows' locks and `superadmins` is every account that is a
 * superadmin then. Refused in this order: the actor, the own account, the
 * last superadmin.
 */
export function accountDeletion(input: {
  readonly actor: DeletionActor;
  readonly target: RoleHolder;
  readonly superadmins: readonly PlayerId[];
}): Result<{ readonly player: PlayerId }, AccountDeletionRefusal> {
  const { actor, target, superadmins } = input;
  if (actor !== 'self') {
    if (!isSuperadmin(actor.admin.role)) return refuse('actor-not-superadmin');
    if (actor.admin.player === target.player) return refuse('own-account');
  }
  const others = superadmins.filter((each) => each !== target.player);
  if (isSuperadmin(target.role) && others.length === 0) {
    return refuse('last-superadmin');
  }
  return ok({ player: target.player });
}

/** A private league the deleted account owned, with the members it has besides the owner. */
export interface OwnedLeague {
  readonly league: LeagueId;
  readonly others: readonly Pick<
    LeagueMember,
    'id' | 'player' | 'isGuest' | 'joinedAt'
  >[];
}

/** What becomes of one owned league: its heir (owner and admin), or its end when nobody is left. */
export type LeagueHandOver =
  | { readonly league: LeagueId; readonly newOwner: PlayerId }
  | { readonly league: LeagueId; readonly deleteEmpty: true };

type Heir = OwnedLeague['others'][number];

/**
 * Longest-standing first: the earlier join time, then the lower membership
 * row id (sportbet's ids are kept, so they follow joining order). A null
 * join time counts as the newest: sportbet's created_at is nullable, but
 * every path that writes a membership (the groups migration, Eloquent)
 * sets it, so a migrated row has one; a standing nobody can show is not
 * "longest".
 */
function seniority(a: Heir, b: Heir): number {
  const first = a.joinedAt ?? Infinity;
  const second = b.joinedAt ?? Infinity;
  if (first !== second) return first < second ? -1 : 1;
  return a.id - b.id;
}

/** The longest-standing full member; a guest only when no full member is left (R-113). */
function heirOf(others: OwnedLeague['others']): Heir | undefined {
  const full = others.filter((each) => !each.isGuest);
  const pool = full.length > 0 ? full : others;
  return [...pool].sort(seniority)[0];
}

/**
 * R-25, R-112, R-113: each private league the deleted account owned passes
 * to its longest-standing other full member (a guest, R-87, inherits only
 * when no full member is left), who becomes its owner and admin; a league
 * with no other member is deleted. One entry per league, in the order given.
 */
export function leagueHandOvers(
  owned: readonly OwnedLeague[],
): readonly LeagueHandOver[] {
  return owned.map(({ league, others }) => {
    const heir = heirOf(others);
    return heir === undefined
      ? { league, deleteEmpty: true }
      : { league, newOwner: heir.player };
  });
}

/**
 * R-19, R-39: an admin's hide of a player in a tournament sets
 * `adminHidden` and nothing else - the switch-off (R-7) is another state,
 * shown and never changed here, and the fill-in count stays.
 */
export function adminHideChange(
  row: TournamentStatusRow,
  hidden: boolean,
): TournamentStatusRow {
  return { ...row, adminHidden: hidden };
}
