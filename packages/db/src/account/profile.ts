import {
  ok,
  refuse,
  personNameInvariant,
  ROLES,
  storedEmailAddress,
  usernameInvariant,
  type EmailAddress,
  type Instant,
  type PlayerId,
  type Result,
  type Role,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { instantOf, keyOf, stored } from '../edge';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
import { isUsernameHeld, takeRegistrationLock } from './identity';
import { playerSettings } from './schema';

/** What /userProfile shows of an account (R-114's "Narys nuo" included). */
export interface Profile {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: EmailAddress;
  /** The address a change waits for, or null. */
  readonly pendingEmail: EmailAddress | null;
  readonly role: Role;
  readonly receiveReminders: boolean;
  readonly createdAt: Instant;
}

const profileRows = z.array(
  z.object({
    id: z.int(),
    username: usernameInvariant.schema,
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
    email: z.string(),
    pendingEmail: z.string().nullable(),
    role: z.enum(ROLES),
    receiveReminders: z.boolean(),
    createdAt: z.date(),
  }),
);

/**
 * The account's profile, read by id and parsed through the domain's schemas;
 * undefined for no such player. An address is read, never looked up by.
 */
export async function loadProfile(
  db: Executor,
  player: PlayerId,
): Promise<Profile | undefined> {
  const [row] = profileRows.parse(
    await db
      .select({
        id: players.id,
        username: players.username,
        name: players.name,
        surname: players.surname,
        email: players.email,
        pendingEmail: players.pendingEmail,
        role: playerSettings.role,
        receiveReminders: playerSettings.receiveReminders,
        createdAt: players.createdAt,
      })
      .from(players)
      .innerJoin(playerSettings, eq(playerSettings.playerId, players.id))
      .where(eq(players.id, keyOf(player, 'player'))),
  );
  if (row === undefined) return undefined;
  return {
    username: row.username,
    name: row.name,
    surname: row.surname,
    email: stored(storedEmailAddress(row.email), 'players', row.id),
    pendingEmail:
      row.pendingEmail === null
        ? null
        : stored(storedEmailAddress(row.pendingEmail), 'players', row.id),
    role: row.role,
    receiveReminders: row.receiveReminders,
    createdAt: instantOf(wholeSecond(row.createdAt), 'players', String(row.id)),
  };
}

/** Instant is to the second: a moment stamped by now() keeps its fraction. */
const wholeSecond = (date: Date): Date =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

type NamesRefusal = 'username-taken' | 'unknown-player';

interface NamesWrite {
  readonly player: PlayerId;
  readonly username: string;
  readonly name: string;
  readonly surname: string;
}

/**
 * ProfileService::updateProfile's names, which take effect at once: the
 * username refused as `username-taken` when another account holds it as
 * sportbet's collation compares it (isUsernameHeld; issue 265), or when
 * `players_username_unique` says so. Saving one's own username unchanged is
 * no collision and takes neither the registration lock nor reads another
 * username: the first statement writes the names only where the stored
 * username is exactly the posted one. Only a changed username takes the lock
 * and asks. The address is never written here.
 */
export async function updateProfileNames(
  db: Executor,
  write: NamesWrite,
): Promise<Result<void, NamesRefusal>> {
  const key = keyOf(write.player, 'player');
  const names = { name: write.name, surname: write.surname };
  try {
    return await db.transaction(
      async (tx): Promise<Result<void, NamesRefusal>> => {
        const unchanged = await tx
          .update(players)
          .set(names)
          .where(and(eq(players.id, key), eq(players.username, write.username)))
          .returning({ id: players.id });
        if (unchanged.length > 0) return ok(undefined);
        await takeRegistrationLock(tx);
        if (await isUsernameHeld(tx, write.username, write.player)) {
          return refuse('username-taken');
        }
        const changed = await tx
          .update(players)
          .set({ username: write.username, ...names })
          .where(eq(players.id, key))
          .returning({ id: players.id });
        return changed.length === 0 ? refuse('unknown-player') : ok(undefined);
      },
    );
  } catch (error) {
    if (violatedUnique(error) === 'players_username_unique') {
      return refuse('username-taken');
    }
    throw error;
  }
}
