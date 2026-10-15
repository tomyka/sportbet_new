import {
  personNameInvariant,
  ROLES,
  storedEmailAddress,
  usernameInvariant,
  type EmailAddress,
  type PlayerId,
  type Role,
} from '@sportbet/domain';
import { asc, eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { playerSettings } from '../account/schema';
import type { Executor } from '../client';
import { playerOf, stored } from '../edge';
import { players } from '../player/players';
import { tournamentPlayers } from '../player/schema';

/** What the users list shows of an account's place in the admin's tournament. */
export interface AdminUserStanding {
  /** R-19: hidden by an admin. */
  readonly adminHidden: boolean;
  /** R-7: switched off for missed games (shown, never changed here). */
  readonly switchedOff: boolean;
}

/** One account as /admin/users lists it. */
export interface AdminUser {
  readonly id: PlayerId;
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  /** Shown to a superadmin only: the owner's consent (slice 4b). */
  readonly email: EmailAddress;
  readonly role: Role;
  /** The hide and the switch-off in the admin's tournament; null for an account that does not play it (no hide button). */
  readonly standing: AdminUserStanding | null;
}

const userRows = z.array(
  z.object({
    id: z.int(),
    username: usernameInvariant.schema,
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
    email: z.string(),
    role: z.enum(ROLES),
    adminHidden: z.boolean().nullable(),
    switchedOff: z.boolean().nullable(),
  }),
);

/**
 * /admin/users: every account by id (as sportbet's `orderBy('id')`), with
 * its role and, for the tournament the admin works on (R-115: a hide is per
 * tournament), whether the account is hidden and whether it is switched
 * off - or no standing when it does not play that tournament. Every account
 * has its settings row (createAccount, the reader), so the join is an inner
 * one. Read with no lock; every row is parsed at the edge.
 */
export async function loadAdminUsers(
  db: Executor,
  tournament: number | null,
): Promise<AdminUser[]> {
  const rows = userRows.parse(
    await db
      .select({
        id: players.id,
        username: players.username,
        name: players.name,
        surname: players.surname,
        email: players.email,
        role: playerSettings.role,
        adminHidden: tournamentPlayers.adminHidden,
        switchedOff: tournamentPlayers.switchedOff,
      })
      .from(players)
      .innerJoin(playerSettings, eq(playerSettings.playerId, players.id))
      .leftJoin(
        tournamentPlayers,
        and(
          eq(tournamentPlayers.playerId, players.id),
          // -1 matches no tournament, so no standing, when none is chosen
          eq(tournamentPlayers.tournamentId, tournament ?? -1),
        ),
      )
      .orderBy(asc(players.id)),
  );
  return rows.map((row) => ({
    id: playerOf(row.id),
    username: row.username,
    name: row.name,
    surname: row.surname,
    email: stored(storedEmailAddress(row.email), 'players', row.id),
    role: row.role,
    standing:
      row.adminHidden === null || row.switchedOff === null
        ? null
        : { adminHidden: row.adminHidden, switchedOff: row.switchedOff },
  }));
}

/**
 * One account as the users list shows it, or null when there is none: what
 * the confirmation page describes (`delete-user`, `change-role`) read from
 * the database again, never from the cookie. It has no standing (the hide
 * and the switch-off need a tournament, which the confirmation does not).
 */
export async function findAdminUser(
  db: Executor,
  player: PlayerId,
): Promise<AdminUser | null> {
  const users = await loadAdminUsers(db, null);
  return users.find((user) => user.id === player) ?? null;
}
