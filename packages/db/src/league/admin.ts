import {
  accountFullName,
  isSuperadmin,
  markGuest,
  ok,
  personNameInvariant,
  refuse,
  superadminDeleteLeague,
  superadminLeagueEdit,
  tournamentId,
  usernameInvariant,
  type GuestMarkRefusal,
  type League,
  type LeagueEntry,
  type LeagueId,
  type LeagueMember,
  type PlayerId,
  type Result,
  type SuperadminDeleteRefusal,
} from '@sportbet/domain';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { lockRoleShared } from '../account/superadmins';
import type { Executor } from '../client';
import { keyOf, playerOf, stored } from '../edge';
import { players } from '../player/players';
import { saveTransaction } from '../save-transaction';
import { deleteLeagueUnderLocks } from './exit';
import {
  leagueColumns,
  leagueRows,
  memberColumns,
  memberRows,
  readLeague,
  readMember,
} from './list';
import { findLeague, lockLeague, lockMember } from './locked';
import { leagueMembers, leagues } from './schema';

/** An admin writer's refusals: the actor is no superadmin (read now), or the league is not in the working tournament. */
export type AdminLeagueRefusal = 'actor-not-superadmin' | 'no-such-league';

/** The tournament as a league's key. */
const tournamentKey = (tournament: number) =>
  stored(tournamentId(String(tournament)), 'tournaments', tournament);

/**
 * The league row under `mode`'s lock, if it is a league of `tournament`: the
 * superadmin's league screens list the admin's working tournament's leagues
 * only (R-95), so another tournament's is not there for them.
 */
async function lockLeagueOf(
  tx: Executor,
  tournament: number,
  league: LeagueId,
  mode: 'update' | 'share',
) {
  const locked = await lockLeague(tx, league, mode);
  return locked?.tournament === tournament ? locked : null;
}

/** The actor's role, read under a shared lock before anything else; true only for a superadmin. */
async function actsAsSuperadmin(
  tx: Executor,
  actor: PlayerId,
): Promise<boolean> {
  const role = await lockRoleShared(tx, actor);
  return role !== null && isSuperadmin(role);
}

/**
 * LeagueController::adminUpdate (sportbet #128): a superadmin edits a league
 * of the tournament they work on with the owner's own form
 * (`superadminLeagueEdit`) - the public league included, which has no owner.
 * One transaction waiting at most 5 s for any lock: the actor's role under a
 * shared lock, then the league row `FOR UPDATE`. A refusal writes nothing.
 */
export async function updateLeagueAsSuperadmin(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: number;
    readonly league: LeagueId;
    readonly entry: LeagueEntry;
  },
): Promise<Result<void, AdminLeagueRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<void, AdminLeagueRefusal>> => {
      if (!(await actsAsSuperadmin(tx, write.actor))) {
        return refuse('actor-not-superadmin');
      }
      const locked = await lockLeagueOf(
        tx,
        write.tournament,
        write.league,
        'update',
      );
      if (locked === null) return refuse('no-such-league');
      const edit = superadminLeagueEdit(write.entry);
      await tx
        .update(leagues)
        .set({
          name: edit.name,
          description: edit.description,
          baseFee: edit.baseFee,
          penaltyStep: edit.penaltyStep,
        })
        .where(eq(leagues.id, write.league));
      return ok(undefined);
    },
  );
}

/**
 * LeagueController::adminDelete (R-118: the emailed code has confirmed it
 * before this is called): a superadmin ends a private league of the
 * tournament they work on, whoever owns it. The actor's role is read under a
 * shared lock first; the rest is `deleteLeagueUnderLocks` (the league row,
 * its members, the players selecting it; they move to the public league, its
 * messages are detached). The public league is refused (`public`).
 */
export async function deleteLeagueAsSuperadmin(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: number;
    readonly league: LeagueId;
  },
): Promise<Result<void, AdminLeagueRefusal | SuperadminDeleteRefusal>> {
  return saveTransaction(
    db,
    async (
      tx,
    ): Promise<Result<void, AdminLeagueRefusal | SuperadminDeleteRefusal>> => {
      if (!(await actsAsSuperadmin(tx, write.actor))) {
        return refuse('actor-not-superadmin');
      }
      return deleteLeagueUnderLocks(tx, {
        league: write.league,
        tournament: write.tournament,
        decide: superadminDeleteLeague,
      });
    },
  );
}

/**
 * R-87: a superadmin marks a member of a league of the tournament they work
 * on a guest, or a full member again. One transaction waiting at most 5 s
 * for any lock: the actor's role under a shared lock, the league row `FOR
 * SHARE` (a delete waits for it), the member's row `FOR UPDATE`; `markGuest`
 * decides. No points change, so nothing recalculates and the leaderboard
 * (tournament-wide) is untouched; the roster narrows at once.
 */
export async function setLeagueGuest(
  db: Executor,
  write: {
    readonly actor: PlayerId;
    readonly tournament: number;
    readonly league: LeagueId;
    readonly player: PlayerId;
    readonly guest: boolean;
  },
): Promise<Result<void, AdminLeagueRefusal | GuestMarkRefusal>> {
  return saveTransaction(
    db,
    async (
      tx,
    ): Promise<Result<void, AdminLeagueRefusal | GuestMarkRefusal>> => {
      if (!(await actsAsSuperadmin(tx, write.actor))) {
        return refuse('actor-not-superadmin');
      }
      const locked = await lockLeagueOf(
        tx,
        write.tournament,
        write.league,
        'share',
      );
      if (locked === null) return refuse('no-such-league');
      const decided = markGuest(
        await lockMember(tx, write.league, write.player, 'update'),
        write.guest,
      );
      if (!decided.ok) return decided;
      await tx
        .update(leagueMembers)
        .set({ isGuest: decided.value.isGuest })
        .where(
          and(
            eq(leagueMembers.leagueId, write.league),
            eq(leagueMembers.playerId, keyOf(write.player, 'player')),
          ),
        );
      return ok(undefined);
    },
  );
}

/** The account that owns a league, as the leagues list shows it. */
export interface AdminLeagueOwner {
  readonly player: PlayerId;
  readonly username: string;
  readonly fullName: string;
}

/** One league as /admin/leagues lists it. */
export interface AdminLeagueRow {
  readonly league: League;
  readonly memberCount: number;
  /** Null for the public league and once the owner's account is gone ("be savininko"). */
  readonly owner: AdminLeagueOwner | null;
}

const countRows = z.array(z.object({ league: z.int(), members: z.int() }));
const ownerRows = z.array(
  z.object({
    id: z.int(),
    username: usernameInvariant.schema,
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
  }),
);

/** The owners' accounts by id, for the leagues that have one. */
async function ownersOf(
  db: Executor,
  rows: readonly { readonly ownerId: number | null }[],
): Promise<Map<number, AdminLeagueOwner>> {
  const ids = [
    ...new Set(
      rows.flatMap(({ ownerId }) => (ownerId === null ? [] : [ownerId])),
    ),
  ];
  if (ids.length === 0) return new Map();
  return new Map(
    ownerRows
      .parse(
        await db
          .select({
            id: players.id,
            username: players.username,
            name: players.name,
            surname: players.surname,
          })
          .from(players)
          .where(inArray(players.id, ids)),
      )
      .map((row) => [
        row.id,
        {
          player: playerOf(row.id),
          username: row.username,
          fullName: accountFullName(row),
        },
      ]),
  );
}

/**
 * /admin/leagues: the leagues of the tournament the admin works on (R-95) -
 * the public one first, then the newest (sportbet's `is_public desc,
 * created_at desc`, a league with no date last, then the higher id) - each
 * with its member count and its owner. Read with no lock.
 */
export async function loadAdminLeagues(
  db: Executor,
  tournament: number,
): Promise<AdminLeagueRow[]> {
  const rows = leagueRows.parse(
    await db
      .select(leagueColumns)
      .from(leagues)
      .where(eq(leagues.tournamentId, tournament))
      .orderBy(
        desc(leagues.isPublic),
        sql`${leagues.createdAt} desc nulls last`,
        desc(leagues.id),
      ),
  );
  const counts = new Map(
    countRows
      .parse(
        await db
          .select({ league: leagueMembers.leagueId, members: count() })
          .from(leagueMembers)
          .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
          .where(eq(leagues.tournamentId, tournament))
          .groupBy(leagueMembers.leagueId),
      )
      .map((row) => [row.league, row.members]),
  );
  const owners = await ownersOf(db, rows);
  return rows.map((row) => ({
    league: readLeague(row, tournamentKey(tournament)),
    memberCount: counts.get(row.id) ?? 0,
    owner: row.ownerId === null ? null : (owners.get(row.ownerId) ?? null),
  }));
}

/** One member as /admin/leagues/{league}/members lists it. */
export interface AdminLeagueMember {
  readonly member: LeagueMember;
  readonly username: string;
  readonly fullName: string;
  /** The league's owner (R-105: owner and former owners are its admins, `member.isAdmin`). */
  readonly isOwner: boolean;
}

export interface AdminLeagueMembers {
  readonly league: League;
  readonly members: readonly AdminLeagueMember[];
}

const memberAccountRows = z.array(
  z.object({
    member: memberRows.element,
    username: usernameInvariant.schema,
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
  }),
);

/**
 * /admin/leagues/{league}/members (R-87): the league's members by when they
 * joined (membership id), with their names, who owns it and who is an admin
 * or a guest. Null when the league is not one of `tournament`'s. Read with
 * no lock.
 */
export async function loadAdminLeagueMembers(
  db: Executor,
  query: { readonly tournament: number; readonly league: LeagueId },
): Promise<AdminLeagueMembers | null> {
  const found = await findLeague(db, query.league);
  if (found?.tournament !== query.tournament) return null;
  const owner = found.league.kind.public ? null : found.league.kind.owner;
  const rows = memberAccountRows.parse(
    await db
      .select({
        member: memberColumns,
        username: players.username,
        name: players.name,
        surname: players.surname,
      })
      .from(leagueMembers)
      .innerJoin(players, eq(players.id, leagueMembers.playerId))
      .where(eq(leagueMembers.leagueId, query.league))
      .orderBy(asc(leagueMembers.id)),
  );
  return {
    league: found.league,
    members: rows.map((row) => {
      const member = readMember(row.member);
      return {
        member,
        username: row.username,
        fullName: accountFullName(row),
        isOwner: owner !== null && member.player === owner,
      };
    }),
  };
}

/**
 * One league of the tournament the admin works on, or null (another
 * tournament's is none): what the `delete-league` confirmation describes,
 * read from the database again.
 */
export async function findAdminLeague(
  db: Executor,
  query: { readonly tournament: number; readonly league: LeagueId },
): Promise<AdminLeagueRow | null> {
  const rows = await loadAdminLeagues(db, query.tournament);
  return rows.find((row) => row.league.id === query.league) ?? null;
}
