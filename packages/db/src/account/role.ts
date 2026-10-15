import {
  roleChange,
  refuse,
  type Instant,
  type PlayerId,
  type Result,
  type Role,
  type RoleChange,
  type RoleChangeRefusal,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { saveTransaction } from '../save-transaction';
import { auditAdminActions, playerSettings } from './schema';
import { lockSuperadmins } from './superadmins';

/** Who changes whose role to which, and when. */
export interface RoleWrite {
  readonly actor: PlayerId;
  readonly target: PlayerId;
  readonly role: Role;
  readonly now: Instant;
}

export type RoleWriteRefusal = 'no-such-account' | RoleChangeRefusal;

/**
 * R-26 amended, R-117: the one writer of a role. One transaction waiting at
 * most 5 s for any lock: every superadmin's `player_settings` row, and the
 * actor's and the target's, `FOR UPDATE` in player id order
 * (`lockSuperadmins`) - before any other row, as `deleteAccount` does - and
 * only then the domain's `roleChange` decides on the roles as they stand
 * (`actor-not-superadmin`, `own-role`, `same-role`, `last-superadmin`).
 * Two superadmins demoting each other at once take turns, and the second
 * finds itself no superadmin, so one always remains. The new role and its
 * `audit_admin_actions` row commit together; a refusal writes nothing. The
 * target's session reads its role again on its next request.
 */
export async function changeRole(
  db: Executor,
  write: RoleWrite,
): Promise<Result<RoleChange, RoleWriteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<RoleChange, RoleWriteRefusal>> => {
      const locked = await lockSuperadmins(tx, [write.actor, write.target]);
      const targetRole = locked.roles.get(write.target);
      if (targetRole === undefined) return refuse('no-such-account');
      const decided = roleChange({
        actor: {
          player: write.actor,
          role: locked.roles.get(write.actor) ?? 'player',
        },
        target: { player: write.target, role: targetRole },
        role: write.role,
        superadmins: locked.superadmins,
      });
      if (!decided.ok) return decided;
      await tx
        .update(playerSettings)
        .set({ role: decided.value.to })
        .where(eq(playerSettings.playerId, keyOf(write.target, 'player')));
      await tx.insert(auditAdminActions).values({
        actorId: keyOf(write.actor, 'player'),
        targetId: keyOf(write.target, 'player'),
        kind: 'role_change',
        oldRole: decided.value.from,
        newRole: decided.value.to,
        at: new Date(write.now),
      });
      return decided;
    },
  );
}
