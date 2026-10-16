import {
  isUsernameTaken,
  ok,
  refuse,
  ROLES,
  storedEmailAddress,
  usernameInvariant,
  type EmailAddress,
  type Instant,
  type PlayerId,
  type Result,
  type Role,
} from '@sportbet/domain';
import { eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { instantOf, keyOf, stored } from '../edge';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
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
    name: z.string(),
    surname: z.string(),
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

const usernameRows = z.array(z.object({ username: z.string() }));

type NamesRefusal = 'username-taken' | 'unknown-player';

/**
 * The advisory lock createAccount takes: a rename, a registration and an
 * address move take turns, so none can slip a taken name or address past
 * another's check.
 */
export const takeRegistrationLock = (tx: Executor): Promise<unknown> =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('registration', 0))`,
  );

/**
 * ProfileService::updateProfile's names, which take effect at once: the
 * username refused as `username-taken` when another account holds it as
 * sportbet's collation compares it (isUsernameTaken; issue 265), or when
 * `players_username_unique` says so. Saving one's own name unchanged is no
 * collision. The address is never written here.
 */
export async function updateProfileNames(
  db: Executor,
  write: {
    readonly player: PlayerId;
    readonly username: string;
    readonly name: string;
    readonly surname: string;
  },
): Promise<Result<void, NamesRefusal>> {
  const key = keyOf(write.player, 'player');
  try {
    return await db.transaction(
      async (tx): Promise<Result<void, NamesRefusal>> => {
        await takeRegistrationLock(tx);
        const others = usernameRows.parse(
          await tx
            .select({ username: players.username })
            .from(players)
            .where(ne(players.id, key)),
        );
        const names = others.map(({ username }) => username);
        if (isUsernameTaken(names, write.username)) {
          return refuse('username-taken');
        }
        const changed = await tx
          .update(players)
          .set({
            username: write.username,
            name: write.name,
            surname: write.surname,
          })
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
