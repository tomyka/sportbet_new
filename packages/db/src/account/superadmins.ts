import { ROLES, type PlayerId, type Role } from '@sportbet/domain';
import { asc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf } from '../edge';
import { playerSettings } from './schema';

/** The roles read under the superadmins' locks: the named accounts', and who is a superadmin. */
export interface LockedRoles {
  /** The role of each account asked for that exists; an account that is gone is absent. */
  readonly roles: ReadonlyMap<PlayerId, Role>;
  /** Every account that is a superadmin now, by player id. */
  readonly superadmins: readonly PlayerId[];
}

const roleRows = z.array(z.object({ player: z.int(), role: z.enum(ROLES) }));

/**
 * R-26 amended, the last-superadmin guard: every superadmin's
 * `player_settings` row, and those of `also` (the actor and the target),
 * locked `FOR UPDATE` in player id order, and read once they are held. A
 * writer that removes or demotes an account takes these before any other
 * row, so two superadmins acting on each other take turns and the second
 * decides on what the first left. A row whose role changed while this
 * waited is read again by the database: an account demoted meanwhile is
 * not a superadmin here. An account promoted meanwhile may be missed,
 * which only ever refuses a removal too soon, never lets one through.
 * Inside a transaction only: the locks end with it.
 */
export async function lockSuperadmins(
  tx: Executor,
  also: readonly PlayerId[],
): Promise<LockedRoles> {
  const rows = roleRows.parse(
    await tx
      .select({ player: playerSettings.playerId, role: playerSettings.role })
      .from(playerSettings)
      .where(
        or(
          eq(playerSettings.role, 'superadmin'),
          inArray(
            playerSettings.playerId,
            also.map((each) => keyOf(each, 'player')),
          ),
        ),
      )
      .orderBy(asc(playerSettings.playerId))
      .for('update'),
  );
  return {
    roles: new Map(rows.map((row) => [playerOf(row.player), row.role])),
    superadmins: rows
      .filter((row) => row.role === 'superadmin')
      .map((row) => playerOf(row.player)),
  };
}

const roleOnly = z.array(z.object({ role: z.enum(ROLES) }));

async function readRole(
  tx: Executor,
  player: PlayerId,
  locking: boolean,
): Promise<Role | null> {
  const query = tx
    .select({ role: playerSettings.role })
    .from(playerSettings)
    .where(eq(playerSettings.playerId, keyOf(player, 'player')));
  const [row] = roleOnly.parse(await (locking ? query.for('share') : query));
  return row?.role ?? null;
}

/**
 * The player's role, read under a shared lock on their `player_settings`
 * row, or null when there is no such account. A writer that acts as an
 * admin (a league edit, a message, a hide) reads its actor's role this way
 * first of all - sportbet `CLAUDE.md`: re-check authority at the point it
 * is used - so a role change, which locks the row `FOR UPDATE`, waits for
 * the write to finish or is already visible to it. Inside a transaction
 * only.
 */
export function lockRoleShared(
  tx: Executor,
  player: PlayerId,
): Promise<Role | null> {
  return readRole(tx, player, true);
}

/** The player's role as it stands now, with no lock (a page's read), or null. */
export function findRole(db: Executor, player: PlayerId): Promise<Role | null> {
  return readRole(db, player, false);
}
