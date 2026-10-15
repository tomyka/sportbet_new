import { loadAdminUsers, setAdminHidden, type AdminUser } from '@sportbet/db';
import {
  accountDeletion,
  isSuperadmin,
  roleChange,
  roleChangeEntry,
  type PlayerId,
} from '@sportbet/domain';
import { ADMIN_USERS_PATH } from '../../components/admin/admin-paths';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { pointsChanged } from '../points-changed';
import { formField } from '../request/form-input';
import type { AdminRequest } from './admin-action';
import {
  HOME,
  invalid,
  NOT_FOUND,
  said,
  type AdminAnswer,
} from './admin-answer';
import { requestConfirmation } from './confirm/request';
import { throttledWrite } from './throttled-write';
import { workingTournament } from './working-tournament';

/** The posted `userID`, read only by idFromText (the domain's `roleChangeEntry` checks it; the role there is a placeholder, only the id is asked). */
function readUserId(
  form: FormData,
):
  | { readonly ok: true; readonly player: PlayerId }
  | { readonly ok: false; readonly answer: AdminAnswer } {
  const entry = roleChangeEntry({
    admin: 'player',
    userID: formField(form, 'userID'),
  });
  return entry.ok
    ? { ok: true, player: entry.value.target }
    : { ok: false, answer: invalid(ADMIN_USERS_PATH, entry.errors) };
}

/** Every account with its role, and who the superadmins are now: what the domain's decisions ask of the world before any mail. */
async function accountsAndSuperadmins(): Promise<{
  readonly users: readonly AdminUser[];
  readonly superadmins: readonly PlayerId[];
}> {
  const users = await loadAdminUsers(getDb(), null);
  return {
    users,
    superadmins: users
      .filter((user) => isSuperadmin(user.role))
      .map((user) => user.id),
  };
}

/**
 * UserController::updateUser's first step (R-26 amended): the posted form
 * checked field by field (the 422 summary), the account must exist (404),
 * and the domain must allow the change now - your own role, the role the
 * account already holds, the last superadmin - so a refused change sends no
 * mail. Then the emailed code is asked for; nothing is written until it
 * comes back (server/admin/confirm/check.ts).
 */
export async function askToChangeRole({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const entry = roleChangeEntry({
    admin: formField(form, 'admin'),
    userID: formField(form, 'userID'),
  });
  if (!entry.ok) return invalid(ADMIN_USERS_PATH, entry.errors);
  const { users, superadmins } = await accountsAndSuperadmins();
  const target = users.find((user) => user.id === entry.value.target);
  if (target === undefined) return NOT_FOUND;
  const decided = roleChange({
    actor: { player: admin.player, role: admin.role },
    target: { player: target.id, role: target.role },
    role: entry.value.role,
    superadmins,
  });
  if (!decided.ok) return roleRefusal(decided.refusal);
  return requestConfirmation({
    admin,
    action: {
      kind: 'change-role',
      player: target.id,
      role: entry.value.role,
    },
    back: ADMIN_USERS_PATH,
  });
}

function roleRefusal(
  refusal:
    'actor-not-superadmin' | 'own-role' | 'same-role' | 'last-superadmin',
): AdminAnswer {
  switch (refusal) {
    case 'actor-not-superadmin':
      return HOME;
    case 'last-superadmin':
      return said(ADMIN_USERS_PATH, 'last-superadmin-role');
    case 'own-role':
    case 'same-role':
      return said(ADMIN_USERS_PATH, refusal);
  }
}

/**
 * UserController::deleteUser's first step (R-25, R-26 amended): `userID`
 * read by idFromText (an array is a refusal, never player 1: issue 281), an
 * unknown account is a 404, and the domain must allow the deletion now -
 * yourself and the last superadmin refused - so a refused delete sends no
 * mail. Then the emailed code is asked for; nothing is deleted here.
 */
export async function askToDeleteUser({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const read = readUserId(form);
  if (!read.ok) return read.answer;
  const { users, superadmins } = await accountsAndSuperadmins();
  const target = users.find((user) => user.id === read.player);
  if (target === undefined) return NOT_FOUND;
  const decided = accountDeletion({
    actor: { admin: { player: admin.player, role: admin.role } },
    target: { player: target.id, role: target.role },
    superadmins,
  });
  if (!decided.ok) {
    return decided.refusal === 'actor-not-superadmin'
      ? HOME
      : said(ADMIN_USERS_PATH, decided.refusal);
  }
  return requestConfirmation({
    admin,
    action: { kind: 'delete-user', player: target.id },
    back: ADMIN_USERS_PATH,
  });
}

/**
 * UserController::toggleHidden (R-19, R-39, R-115), as a form post: the
 * account's hide in the tournament the admin works on, set or cleared by
 * setAdminHidden under the player's status locks, which leaves the switch-off
 * alone. `userID` by idFromText, an unknown account a 404, an account that
 * does not play the tournament refused. No emailed code (the same button
 * undoes it); the boards go (pointsChanged).
 */
export async function toggleHidden({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const read = readUserId(form);
  if (!read.ok) return read.answer;
  const { users } = await accountsAndSuperadmins();
  const target = users.find((user) => user.id === read.player);
  if (target === undefined) return NOT_FOUND;
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_USERS_PATH, 'no-tournament');
  const db = getDb();
  return throttledWrite(
    db,
    { player: admin.player, now: now(), to: ADMIN_USERS_PATH },
    async () => {
      const toggled = await setAdminHidden(db, {
        actor: admin.player,
        tournament,
        player: target.id,
      });
      if (!toggled.ok) {
        return toggled.refusal === 'actor-not-superadmin'
          ? HOME
          : said(ADMIN_USERS_PATH, 'not-a-player');
      }
      pointsChanged();
      return said(
        ADMIN_USERS_PATH,
        toggled.value.hidden ? 'user-hidden' : 'user-shown',
        { name: target.username },
      );
    },
  );
}
