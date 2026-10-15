import {
  tournamentId,
  type League,
  type LeagueId,
  type LeagueInvite,
  type LeagueMember,
  type PlayerId,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { instantOf, keyOf, playerOf, stored } from '../edge';
import {
  leagueColumns,
  leagueOf,
  leagueRows,
  memberColumns,
  memberRows,
  readLeague,
  readMember,
} from './list';
import { leagueInvites, leagueMembers, leagues } from './schema';

/**
 * How a league writer holds a row it read: the league row `FOR UPDATE` when
 * it changes the league or who is in it, `FOR SHARE` when it only needs the
 * league to stay (a switch, a leave). The lock order is lock.ts's.
 */
export type RowLock = 'update' | 'share';

/** A league read under its lock, with the tournament it belongs to. */
export interface LockedLeague {
  readonly league: League;
  readonly tournament: number;
}

const lockedLeagueRows = z.array(
  leagueRows.element.extend({ tournament: z.int() }),
);

/** The league row, under `mode`'s lock or with none, or null when there is none. */
async function readLeagueRow(
  tx: Executor,
  league: LeagueId,
  mode: RowLock | null,
): Promise<LockedLeague | null> {
  const query = tx
    .select({ ...leagueColumns, tournament: leagues.tournamentId })
    .from(leagues)
    .where(eq(leagues.id, league));
  const [row] = lockedLeagueRows.parse(
    await (mode === null ? query : query.for(mode, { of: leagues })),
  );
  return row === undefined
    ? null
    : {
        league: readLeague(
          row,
          stored(tournamentId(String(row.tournament)), 'leagues', row.id),
        ),
        tournament: row.tournament,
      };
}

/** The league row under the lock, or null when there is none. First in a league writer's order. */
export function lockLeague(
  tx: Executor,
  league: LeagueId,
  mode: RowLock,
): Promise<LockedLeague | null> {
  return readLeagueRow(tx, league, mode);
}

/** The league row read with no lock (a page), or null when there is none. */
export function findLeague(
  db: Executor,
  league: LeagueId,
): Promise<LockedLeague | null> {
  return readLeagueRow(db, league, null);
}

/** One player's membership under the lock, or null. */
export async function lockMember(
  tx: Executor,
  league: LeagueId,
  player: PlayerId,
  mode: RowLock,
): Promise<LeagueMember | null> {
  const [row] = memberRows.parse(
    await tx
      .select(memberColumns)
      .from(leagueMembers)
      .where(
        and(
          eq(leagueMembers.leagueId, league),
          eq(leagueMembers.playerId, keyOf(player, 'player')),
        ),
      )
      .for(mode),
  );
  return row === undefined ? null : readMember(row);
}

const inviteRows = z.array(
  z.object({
    id: z.int(),
    leagueId: z.int(),
    inviteeId: z.int(),
    invitedById: z.int().nullable(),
    createdAt: z.date().nullable(),
  }),
);

/** A pending invite as the domain's. */
function readInvite(row: z.infer<typeof inviteRows>[number]): LeagueInvite {
  return {
    id: row.id,
    league: leagueOf(row.leagueId),
    invitee: playerOf(row.inviteeId),
    invitedBy: row.invitedById === null ? null : playerOf(row.invitedById),
    createdAt:
      row.createdAt === null
        ? null
        : instantOf(
            new Date(Math.floor(row.createdAt.getTime() / 1000) * 1000),
            'league_invites',
            String(row.id),
          ),
  };
}

const inviteColumns = {
  id: leagueInvites.id,
  leagueId: leagueInvites.leagueId,
  inviteeId: leagueInvites.inviteeId,
  invitedById: leagueInvites.invitedById,
  createdAt: leagueInvites.createdAt,
};

/** A pending invite by id, under `FOR UPDATE`, or null. */
export async function lockInvite(
  tx: Executor,
  invite: number,
): Promise<LeagueInvite | null> {
  const [row] = inviteRows.parse(
    await tx
      .select(inviteColumns)
      .from(leagueInvites)
      .where(eq(leagueInvites.id, invite))
      .for('update'),
  );
  return row === undefined ? null : readInvite(row);
}

/** An invite's league, with no lock: which league row to take first. */
export async function leagueOfInvite(
  tx: Executor,
  invite: number,
): Promise<LeagueId | null> {
  const [row] = inviteRows.parse(
    await tx
      .select(inviteColumns)
      .from(leagueInvites)
      .where(eq(leagueInvites.id, invite)),
  );
  return row === undefined ? null : leagueOf(row.leagueId);
}

/** Every member of the league under `FOR UPDATE`, by player. */
export async function lockMembers(
  tx: Executor,
  league: LeagueId,
): Promise<LeagueMember[]> {
  return memberRows
    .parse(
      await tx
        .select(memberColumns)
        .from(leagueMembers)
        .where(eq(leagueMembers.leagueId, league))
        .orderBy(asc(leagueMembers.playerId))
        .for('update'),
    )
    .map(readMember);
}
