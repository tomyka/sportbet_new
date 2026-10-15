import {
  isSuperadmin,
  mayEditMessages,
  ok,
  refuse,
  storedLeagueMessage,
  type LeagueId,
  type Instant,
  type LeagueMessage,
  type MessageEntry,
  type PlayerId,
  type Result,
  type Role,
} from '@sportbet/domain';
import { asc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { lockRoleShared } from '../account/superadmins';
import type { Executor } from '../client';
import { leagueOf } from '../league/list';
import { lockLeague } from '../league/locked';
import { leagues, messages } from '../league/schema';
import { saveTransaction } from '../save-transaction';
import { stored } from '../edge';

/**
 * `actor-not-allowed`: the actor's role (read now) may not do this;
 * `league-not-allowed`: R-95, the league is none of the admin's
 * tournament's (or is gone); `no-such-message`: no such message in the
 * messages the admin sees (another tournament's league's is not there).
 */
export type MessageWriteRefusal =
  'actor-not-allowed' | 'league-not-allowed' | 'no-such-message';

/** A message as /admin/messages lists it, with the name of the league it belongs to. */
export interface AdminMessage {
  readonly message: LeagueMessage;
  /** Null for a detached message (`league` null): shown nowhere, but listed so it can be re-attached or deleted. */
  readonly leagueName: string | null;
}

/** The page's data: the messages of the tournament's leagues and the detached ones, and the leagues the select offers. */
export interface AdminMessages {
  readonly messages: readonly AdminMessage[];
  readonly leagues: readonly { readonly id: LeagueId; readonly name: string }[];
}

const listedRows = z.array(
  z.object({
    id: z.int(),
    leagueId: z.int().nullable(),
    text: z.string(),
    active: z.boolean(),
    leagueName: z.string().nullable(),
  }),
);
const leagueNameRows = z.array(z.object({ id: z.int(), name: z.string() }));

/**
 * /admin/messages: the messages of the admin's tournament's leagues (R-95)
 * plus the detached ones (league null), by id, and the tournament's leagues,
 * by id, for the select. Nothing of another tournament. Every row is parsed
 * with the domain's `storedLeagueMessage`. Read with no lock.
 */
export async function loadAdminMessages(
  db: Executor,
  tournament: number,
): Promise<AdminMessages> {
  const rows = listedRows.parse(
    await db
      .select({
        id: messages.id,
        leagueId: messages.leagueId,
        text: messages.text,
        active: messages.active,
        leagueName: leagues.name,
      })
      .from(messages)
      .leftJoin(leagues, eq(leagues.id, messages.leagueId))
      .where(
        or(isNull(messages.leagueId), eq(leagues.tournamentId, tournament)),
      )
      .orderBy(asc(messages.id)),
  );
  const options = leagueNameRows.parse(
    await db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(eq(leagues.tournamentId, tournament))
      .orderBy(asc(leagues.id)),
  );
  return {
    messages: rows.map((row) => ({
      message: stored(
        storedLeagueMessage({
          id: row.id,
          league: row.leagueId === null ? null : leagueOf(row.leagueId),
          text: row.text,
          active: row.active,
        }),
        'messages',
        row.id,
      ),
      leagueName: row.leagueName,
    })),
    leagues: options.map((row) => ({ id: leagueOf(row.id), name: row.name })),
  };
}

const messageRows = z.array(z.object({ league: z.int().nullable() }));

/** The league of a message, read with no lock, `undefined` when there is no such message. */
async function leagueOfMessage(
  tx: Executor,
  message: number,
): Promise<LeagueId | null | undefined> {
  const [row] = messageRows.parse(
    await tx
      .select({ league: messages.leagueId })
      .from(messages)
      .where(eq(messages.id, message)),
  );
  if (row === undefined) return undefined;
  return row.league === null ? null : leagueOf(row.league);
}

/** The message row `FOR UPDATE`, and the league it belongs to now: undefined for none. */
async function lockMessage(
  tx: Executor,
  message: number,
): Promise<LeagueId | null | undefined> {
  const [row] = messageRows.parse(
    await tx
      .select({ league: messages.leagueId })
      .from(messages)
      .where(eq(messages.id, message))
      .for('update'),
  );
  if (row === undefined) return undefined;
  return row.league === null ? null : leagueOf(row.league);
}

/**
 * Takes the league rows `FOR SHARE`, in league id order (the league writers'
 * order, lock.ts: a league delete takes the row first and detaches the
 * messages after). Returns the first league, in that order, that is not
 * there or is not a league of `tournament`, or null when all are.
 */
async function lockLeaguesOf(
  tx: Executor,
  tournament: number,
  wanted: readonly (LeagueId | null)[],
): Promise<LeagueId | null> {
  const ids = [...new Set(wanted.filter((league) => league !== null))].toSorted(
    (a, b) => a - b,
  );
  for (const league of ids) {
    const locked = await lockLeague(tx, league, 'share');
    if (locked?.tournament !== tournament) return league;
  }
  return null;
}

/** The actor's role, read under a shared lock first of all. */
const roleOf = (tx: Executor, actor: PlayerId): Promise<Role | null> =>
  lockRoleShared(tx, actor);

/**
 * MessageController::insertMessage (R-95, R-116): a results manager or a
 * superadmin writes a message. One transaction waiting at most 5 s for any
 * lock: the actor's role under a shared lock, the league row `FOR SHARE`
 * (a league deleted meanwhile is `league-not-allowed`, not a foreign-key
 * error), then the insert. The league must be one of `tournament`'s or
 * null (a blank league: stored, shown nowhere). A refusal writes nothing.
 */
export async function insertMessage(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: number;
    readonly entry: MessageEntry;
    readonly now: Instant;
  },
): Promise<Result<{ readonly message: number }, MessageWriteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<{ message: number }, MessageWriteRefusal>> => {
      const role = await roleOf(tx, write.actor);
      if (role === null || !mayEditMessages(role)) {
        return refuse('actor-not-allowed');
      }
      const refused = await lockLeaguesOf(tx, write.tournament, [
        write.entry.league,
      ]);
      if (refused !== null) return refuse('league-not-allowed');
      const [inserted] = z.array(z.object({ id: z.int() })).parse(
        await tx
          .insert(messages)
          .values({
            leagueId: write.entry.league,
            text: write.entry.text,
            active: write.entry.active,
            createdAt: new Date(write.now),
            updatedAt: new Date(write.now),
          })
          .returning({ id: messages.id }),
      );
      if (inserted === undefined) {
        throw new Error('insertMessage: the insert returned no message');
      }
      return ok({ message: inserted.id });
    },
  );
}

/**
 * The message `message` under its locks, for an update or a delete: the
 * league rows it touches `FOR SHARE` in id order, then the message row `FOR
 * UPDATE`. A message whose league is another tournament's is not one the
 * admin sees (`no-such-message`); one that moved to another league while
 * this waited is read again, not trusted (`no-such-message`, ask again).
 * `into` is the league an update moves it to, which must be allowed.
 */
async function lockedMessage(
  tx: Executor,
  tournament: number,
  message: number,
  into: LeagueId | null,
): Promise<'league-not-allowed' | 'no-such-message' | 'locked'> {
  const before = await leagueOfMessage(tx, message);
  if (before === undefined) return 'no-such-message';
  const refused = await lockLeaguesOf(tx, tournament, [before, into]);
  if (refused !== null) {
    return refused === before ? 'no-such-message' : 'league-not-allowed';
  }
  return (await lockMessage(tx, message)) === before
    ? 'locked'
    : 'no-such-message';
}

/**
 * MessageController::updateMessage's `update` (R-95, R-116): a results
 * manager or a superadmin rewrites a message of the tournament's leagues,
 * or a detached one (which this may re-attach). Locks as `insertMessage`,
 * plus the message row. A refusal writes nothing.
 */
export async function updateMessage(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: number;
    readonly message: number;
    readonly entry: MessageEntry;
    readonly now: Instant;
  },
): Promise<Result<void, MessageWriteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<void, MessageWriteRefusal>> => {
      const role = await roleOf(tx, write.actor);
      if (role === null || !mayEditMessages(role)) {
        return refuse('actor-not-allowed');
      }
      const locked = await lockedMessage(
        tx,
        write.tournament,
        write.message,
        write.entry.league,
      );
      if (locked !== 'locked') return refuse(locked);
      await tx
        .update(messages)
        .set({
          leagueId: write.entry.league,
          text: write.entry.text,
          active: write.entry.active,
          updatedAt: new Date(write.now),
        })
        .where(eq(messages.id, write.message));
      return ok(undefined);
    },
  );
}

/**
 * MessageController::updateMessage's `delete` (R-95, R-116: a superadmin
 * only; the emailed code has confirmed it, R-26). Same locks as an update.
 * A refusal writes nothing.
 */
export async function deleteMessage(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: number;
    readonly message: number;
  },
): Promise<Result<void, MessageWriteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<void, MessageWriteRefusal>> => {
      const role = await roleOf(tx, write.actor);
      if (role === null || !isSuperadmin(role)) {
        return refuse('actor-not-allowed');
      }
      const locked = await lockedMessage(
        tx,
        write.tournament,
        write.message,
        null,
      );
      if (locked !== 'locked') return refuse(locked);
      await tx.delete(messages).where(eq(messages.id, write.message));
      return ok(undefined);
    },
  );
}

/**
 * One message of the admin's tournament's leagues, or a detached one, or
 * null: what the `delete-league-message` confirmation describes, read from
 * the database again.
 */
export async function findAdminMessage(
  db: Executor,
  tournament: number,
  message: number,
): Promise<AdminMessage | null> {
  const page = await loadAdminMessages(db, tournament);
  return page.messages.find((row) => row.message.id === message) ?? null;
}
