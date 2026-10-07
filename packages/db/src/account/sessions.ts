import {
  personNameInvariant,
  ROLES,
  sessionExpiresAt,
  type AuditLoginMethod,
  type Instant,
  type PlayerId,
  type Role,
} from '@sportbet/domain';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf } from '../edge';
import { players } from '../player/schema';
import { auditLogins, playerSettings, sessions } from './schema';

/** The player behind a live session, and what the shell and the context read of them. */
export interface SignedInPlayer {
  readonly player: PlayerId;
  readonly name: string;
  readonly surname: string;
  /** R-26 (amended): re-read with the session on every request. */
  readonly role: Role;
  /** R-28: the last-used tournament's id, or null. */
  readonly lastTournament: number | null;
}

const signedInRows = z.array(
  z.object({
    player: z.int(),
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
    role: z.enum(ROLES).nullable(),
    lastTournament: z.int().nullable(),
  }),
);

/** Starts a session for the player: last seen now, ending 90 days on (R-44). */
export async function createSession(
  db: Executor,
  session: {
    readonly player: PlayerId;
    readonly tokenHash: string;
    readonly now: Instant;
  },
): Promise<void> {
  const now = new Date(session.now);
  await db.insert(sessions).values({
    tokenHash: session.tokenHash,
    playerId: keyOf(session.player, 'player'),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(sessionExpiresAt(session.now)),
  });
}

/**
 * The signed-in player of the session whose token hashes to `tokenHash`,
 * if it has not ended by `now`. An account with no settings row is an
 * impossible state (the reader, the seed and registration write one with
 * every account): it throws.
 */
export async function findSignedInPlayer(
  db: Executor,
  tokenHash: string,
  now: Instant,
): Promise<SignedInPlayer | undefined> {
  const rows = await db
    .select({
      player: players.id,
      name: players.name,
      surname: players.surname,
      role: playerSettings.role,
      lastTournament: playerSettings.lastTournamentId,
    })
    .from(sessions)
    .innerJoin(players, eq(players.id, sessions.playerId))
    .leftJoin(playerSettings, eq(playerSettings.playerId, players.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date(now)),
      ),
    )
    .limit(1);
  const [row] = signedInRows.parse(rows);
  if (row === undefined) return undefined;
  if (row.role === null) {
    throw new Error(
      `sessions: player ${String(row.player)} has no player_settings row`,
    );
  }
  return {
    player: playerOf(row.player),
    name: row.name,
    surname: row.surname,
    role: row.role,
    lastTournament: row.lastTournament,
  };
}

/**
 * R-44: a visit at `now` extends the session to 90 days from it. A session
 * that has already ended is not revived. True if the session is live.
 */
export async function touchSession(
  db: Executor,
  tokenHash: string,
  now: Instant,
): Promise<boolean> {
  const at = new Date(now);
  const touched = await db
    .update(sessions)
    .set({ lastSeenAt: at, expiresAt: new Date(sessionExpiresAt(now)) })
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, at)))
    .returning({ id: sessions.id });
  return touched.length === 1;
}

/** Ends one session (sign-out on this browser). */
export async function deleteSession(
  db: Executor,
  tokenHash: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** AuditLoginsController::insertAuditLogin: who signed in, how, when. */
export async function recordLogin(
  db: Executor,
  login: {
    readonly player: PlayerId;
    readonly method: AuditLoginMethod;
    readonly at: Instant;
  },
): Promise<void> {
  await db.insert(auditLogins).values({
    playerId: keyOf(login.player, 'player'),
    method: login.method,
    at: new Date(login.at),
  });
}
