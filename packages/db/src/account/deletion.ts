import {
  accountDeletion,
  leagueHandOvers,
  ok,
  refuse,
  type AccountDeletionRefusal,
  type DeletionActor,
  type Instant,
  type LeagueHandOver,
  type OwnedLeague,
  type PlayerId,
  type Result,
  type Role,
} from '@sportbet/domain';
import { and, asc, eq, getTableName, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor, Tx } from '../client';
import { keyOf } from '../edge';
import { leagueInvites, leagueMembers, leagues } from '../league/schema';
import {
  leagueOf,
  memberColumns,
  memberRows,
  readMember,
} from '../league/list';
import { lockPlayerStatuses } from '../player/repository';
import { players, tournamentPlayers } from '../player/schema';
import { matchPoints, standingsPoints, survivalPoints } from '../points/schema';
import { matchPredictions } from '../prediction/schema';
import { lockTournamentById } from '../recalculation/lock';
import { saveTransaction } from '../save-transaction';
import { standingsPredictions } from '../standings/schema';
import { tournaments } from '../tournament/schema';
import { survivalPicks } from '../survival/schema';
import { auditAdminActions, loginCodes } from './schema';
import { lockSuperadmins } from './superadmins';

/**
 * The tables deleteAccount deletes from explicitly, in the order it does -
 * the ones whose key to `players` restricts. Every other key to `players`
 * cascades or sets null, and `player-fk-coverage.test.ts` fails on a key
 * that is neither this list's nor one of those (sportbet issue 266: two
 * deletion lists drifted apart and strands an account).
 */
const PLAYER_TABLES = [
  tournamentPlayers,
  matchPoints,
  standingsPoints,
  survivalPoints,
  matchPredictions,
  standingsPredictions,
  survivalPicks,
] as const;

export const PLAYER_ROWS_DELETED: readonly string[] =
  PLAYER_TABLES.map(getTableName);

/** Who asks, which account goes, and when. */
export interface AccountDelete {
  readonly target: PlayerId;
  /** `'self'` (slice 17's profile) or the admin's own id, whose role is read again under the locks. */
  readonly by: 'self' | { readonly admin: PlayerId };
  readonly now: Instant;
}

export type AccountDeleteRefusal = 'no-such-account' | AccountDeletionRefusal;

/** What a deletion did to the leagues the account owned, for the page's message. */
export interface AccountDeleted {
  readonly handedOver: readonly LeagueHandOver[];
}

const leagueRows = z.array(
  z.object({ id: z.int(), owner: z.int().nullable() }),
);

/**
 * Every tournament, by id, and its recalculation lock taken in that order.
 * Not only the player's: a join into another tournament takes that
 * tournament's lock first, so holding every one keeps a join from landing a
 * `tournament_players` row after the check below, which would refuse the
 * player's delete.
 */
async function lockEveryTournament(tx: Executor): Promise<ReadonlySet<number>> {
  const rows = z
    .array(z.object({ id: z.int() }))
    .parse(
      await tx
        .select({ id: tournaments.id })
        .from(tournaments)
        .orderBy(asc(tournaments.id)),
    );
  for (const { id } of rows) await lockTournamentById(tx, id);
  return new Set(rows.map(({ id }) => id));
}

/**
 * Whether the account gained something the locks taken so far do not cover
 * while they were being taken: a place in a tournament created or joined
 * after the tournaments were read, or a league founded (foundLeague takes
 * the player's statuses first, and no league lock) between reading the
 * owned leagues and locking the statuses. The deletion then starts over
 * with the new rows in view; nothing was written.
 */
async function raced(
  tx: Executor,
  seen: {
    readonly player: number;
    readonly tournaments: ReadonlySet<number>;
    readonly statuses: Awaited<ReturnType<typeof lockPlayerStatuses>>;
    readonly owned: readonly number[];
  },
): Promise<boolean> {
  if (
    seen.statuses.some((row) => !seen.tournaments.has(Number(row.tournament)))
  ) {
    return true;
  }
  const ownedNow = leagueRows.parse(
    await tx
      .select({ id: leagues.id, owner: leagues.ownerId })
      .from(leagues)
      .where(eq(leagues.ownerId, seen.player)),
  );
  return ownedNow.some(({ id }) => !seen.owned.includes(id));
}

/**
 * The league writers' lock order (lock.ts), for every league the account
 * touches, by league id: the league rows `FOR UPDATE` (the leagues it owns,
 * is a member of, or is invited to), the account's invites, then the
 * members - the owned leagues' by player, and the account's own memberships.
 * Returns the owned leagues' ids and every member row read under the locks.
 */
async function lockLeaguesOf(tx: Executor, player: number) {
  const touching = tx
    .select({ id: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(eq(leagueMembers.playerId, player));
  const invitedTo = tx
    .select({ id: leagueInvites.leagueId })
    .from(leagueInvites)
    .where(eq(leagueInvites.inviteeId, player));
  const rows = leagueRows.parse(
    await tx
      .select({ id: leagues.id, owner: leagues.ownerId })
      .from(leagues)
      .where(
        or(
          eq(leagues.ownerId, player),
          inArray(leagues.id, touching),
          inArray(leagues.id, invitedTo),
        ),
      )
      .orderBy(asc(leagues.id))
      .for('update', { of: leagues }),
  );
  await tx
    .select({ id: leagueInvites.id })
    .from(leagueInvites)
    .where(eq(leagueInvites.inviteeId, player))
    .orderBy(asc(leagueInvites.id))
    .for('update');
  const owned = rows.filter((row) => row.owner === player).map(({ id }) => id);
  const members = memberRows
    .parse(
      await tx
        .select(memberColumns)
        .from(leagueMembers)
        .where(
          or(
            eq(leagueMembers.playerId, player),
            owned.length === 0
              ? undefined
              : inArray(leagueMembers.leagueId, owned),
          ),
        )
        .orderBy(asc(leagueMembers.leagueId), asc(leagueMembers.playerId))
        .for('update'),
    )
    .map(readMember);
  return { owned, members };
}

/** Each owned league with the members it has besides the account. */
function ownedLeagues(
  target: PlayerId,
  found: Awaited<ReturnType<typeof lockLeaguesOf>>,
): OwnedLeague[] {
  return found.owned.map((id) => ({
    league: leagueOf(id),
    others: found.members.filter(
      (member) => member.league === id && member.player !== target,
    ),
  }));
}

/**
 * The one path that removes a player (R-25): the admin's, and slice 17's own
 * with `by: 'self'`. One transaction under the lock order, waiting at most
 * 5 s for any lock: the superadmins' `player_settings` rows first (the
 * last-superadmin guard, `lockSuperadmins`), the domain's decision
 * (`accountDeletion`) - a refusal writes nothing - the recalculation lock of
 * every tournament in id order (so no result or registration writes a row
 * for them mid-deletion), their `match_predictions`
 * by game, the leagues they own, belong to or are invited to
 * (`lockLeaguesOf`), then their `tournament_players` rows
 * (`lockPlayerStatuses`). Then, in `PLAYER_ROWS_DELETED` order, the
 * restricting rows go; each owned league passes to its heir, or is deleted
 * when nobody else is in it (`leagueHandOvers`: R-25, R-112, R-113); the
 * address's login codes go by exact equality (#41); an admin's deletion is
 * recorded (R-117); and the player row last, which cascades the settings,
 * sessions, sign-ins, prediction audits, memberships and invites, and
 * forgets the account in `audit_results` and the admin trail (R-69, R-117).
 * No recalculation runs, so nobody else's stored points move (R-99). The
 * one thing deleted outside recalculateTournament is the player's own
 * derived rows (match, standings and survival points): the player ceases
 * to exist, and no other player's stored point or odds moves.
 *
 * A join or a league founded while the locks were being taken (`raced`)
 * rolls the attempt back - it wrote nothing - and starts it again, now
 * seeing it; the lock order is kept, never a lock taken out of turn.
 */
export async function deleteAccount(
  db: Executor,
  request: AccountDelete,
): Promise<Result<AccountDeleted, AccountDeleteRefusal>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const done = await attemptDeletion(db, request);
    if (done !== 'raced') return done;
  }
  throw new Error(
    `deleteAccount: player ${request.target} kept gaining rows while being deleted`,
  );
}

/** One more attempt each time a join or a founded league raced the locks; a fifth in a row is no race. */
const MAX_ATTEMPTS = 5;

/** One transaction of deleteAccount: the deletion, a refusal, or `'raced'` with nothing written. */
async function attemptDeletion(
  db: Executor,
  request: AccountDelete,
): Promise<Result<AccountDeleted, AccountDeleteRefusal> | 'raced'> {
  return saveTransaction(
    db,
    async (
      tx,
    ): Promise<Result<AccountDeleted, AccountDeleteRefusal> | 'raced'> => {
      const { target } = request;
      const admin = request.by === 'self' ? null : request.by.admin;
      const locked = await lockSuperadmins(
        tx,
        admin === null ? [target] : [target, admin],
      );
      const targetRole = locked.roles.get(target);
      if (targetRole === undefined) return refuse('no-such-account');
      const actor: DeletionActor =
        admin === null
          ? 'self'
          : {
              admin: {
                player: admin,
                role: locked.roles.get(admin) ?? 'player',
              },
            };
      const decided = accountDeletion({
        actor,
        target: { player: target, role: targetRole },
        superadmins: locked.superadmins,
      });
      if (!decided.ok) return decided;
      const removed = await remove(tx, request, targetRole);
      return removed === 'raced' ? removed : ok(removed);
    },
  );
}

/** The deletion once it is decided: the rest of the locks, then the writes. */
async function remove(
  tx: Tx,
  request: AccountDelete,
  role: Role,
): Promise<AccountDeleted | 'raced'> {
  const { target } = request;
  const key = keyOf(target, 'player');
  const lockedTournaments = await lockEveryTournament(tx);
  await tx
    .select({ game: matchPredictions.gameId })
    .from(matchPredictions)
    .where(eq(matchPredictions.playerId, key))
    .orderBy(asc(matchPredictions.gameId))
    .for('update');
  const found = await lockLeaguesOf(tx, key);
  const statuses = await lockPlayerStatuses(tx, target);
  if (
    await raced(tx, {
      player: key,
      tournaments: lockedTournaments,
      statuses,
      owned: found.owned,
    })
  ) {
    return 'raced';
  }
  const [{ email, pendingEmail }] = z
    .tuple([
      z.object({ email: z.string(), pendingEmail: z.string().nullable() }),
    ])
    .parse(
      await tx
        .select({ email: players.email, pendingEmail: players.pendingEmail })
        .from(players)
        .where(eq(players.id, key)),
    );
  const handedOver = leagueHandOvers(ownedLeagues(target, found));
  for (const table of PLAYER_TABLES) {
    await tx.delete(table).where(eq(table.playerId, key));
  }
  await carryOut(tx, handedOver);
  // The address a change waits for is the account's too (R-24, #41): its codes
  // are the same bearer secrets, so they go by exact equality as well.
  await tx
    .delete(loginCodes)
    .where(
      pendingEmail === null
        ? eq(loginCodes.email, email)
        : inArray(loginCodes.email, [email, pendingEmail]),
    );
  if (request.by !== 'self') {
    await recordDeletion(tx, request.by.admin, role, request.now);
  }
  await tx.delete(players).where(eq(players.id, key));
  return { handedOver };
}

/** R-25, R-112, R-113: each owned league to its heir, who becomes its owner and admin, or gone with its invites. */
async function carryOut(
  tx: Tx,
  handedOver: readonly LeagueHandOver[],
): Promise<void> {
  for (const each of handedOver) {
    if ('deleteEmpty' in each) {
      await tx.delete(leagues).where(eq(leagues.id, each.league));
    } else {
      const heir = keyOf(each.newOwner, 'player');
      await tx
        .update(leagues)
        .set({ ownerId: heir })
        .where(eq(leagues.id, each.league));
      await tx
        .update(leagueMembers)
        .set({ isAdmin: true })
        .where(
          and(
            eq(leagueMembers.leagueId, each.league),
            eq(leagueMembers.playerId, heir),
          ),
        );
    }
  }
}

/** R-117: the deletion, with the role the account held; the account itself is forgotten as it goes. */
async function recordDeletion(
  tx: Tx,
  admin: PlayerId,
  role: Role,
  now: Instant,
): Promise<void> {
  await tx.insert(auditAdminActions).values({
    actorId: keyOf(admin, 'player'),
    targetId: null,
    kind: 'account_deletion',
    oldRole: role,
    newRole: null,
    at: new Date(now),
  });
}
