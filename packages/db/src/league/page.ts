import {
  leagueNameInvariant,
  leaguesPage,
  personNameInvariant,
  usernameInvariant,
  type LeaguePerson,
  type LeagueRows,
  type LeaguesPage,
  type PendingInvite,
  type PlayerId,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, playerOf, keyOfTournament } from '../edge';
import { players } from '../player/players';
import { tournamentPlayers } from '../player/schema';
import {
  leagueColumns,
  leagueRows,
  memberColumns,
  memberRows,
  readLeague,
  readMember,
} from './list';
import { leagueInvites, leagueMembers, leagues } from './schema';

const mineRows = z.array(
  z.object({ league: leagueRows.element, member: memberRows.element }),
);
const selectedRows = z.array(z.object({ league: z.int() }));
const countRows = z.array(z.object({ league: z.int(), members: z.int() }));

const personColumns = {
  player: players.id,
  name: players.name,
  surname: players.surname,
  username: players.username,
};
const personRow = z.object({
  player: z.int(),
  name: personNameInvariant.schema,
  surname: personNameInvariant.schema,
  username: usernameInvariant.schema,
});
const memberLineRows = z.array(
  personRow.extend({ league: z.int(), isAdmin: z.boolean() }),
);
const inviteeRows = z.array(personRow.extend({ league: z.int() }));
const inviteRows = z.array(
  z.object({
    id: z.int(),
    leagueName: leagueNameInvariant.schema,
    inviter: usernameInvariant.schema.nullable(),
  }),
);

const personOf = (row: z.infer<typeof personRow>): LeaguePerson => ({
  player: playerOf(row.player),
  name: row.name,
  surname: row.surname,
  username: row.username,
});

/** The viewer's selection in the tournament, or null. */
async function selectedLeague(
  db: Executor,
  player: number,
  tournament: number,
): Promise<number | null> {
  const [row] = selectedRows.parse(
    await db
      .select({ league: tournamentPlayers.selectedLeagueId })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.playerId, player),
          eq(tournamentPlayers.tournamentId, tournament),
        ),
      ),
  );
  return row?.league ?? null;
}

/** How many members each league has (every member, as `members()->count()`). */
async function memberCounts(
  db: Executor,
  ids: readonly number[],
): Promise<ReadonlyMap<number, number>> {
  if (ids.length === 0) return new Map();
  return new Map(
    countRows
      .parse(
        await db
          .select({ league: leagueMembers.leagueId, members: count() })
          .from(leagueMembers)
          .where(inArray(leagueMembers.leagueId, ids))
          .groupBy(leagueMembers.leagueId),
      )
      .map((row) => [row.league, row.members]),
  );
}

/** The members of the leagues the viewer administers, by member id. */
async function membersOf(db: Executor, ids: readonly number[]) {
  if (ids.length === 0) return [];
  return memberLineRows.parse(
    await db
      .select({
        ...personColumns,
        league: leagueMembers.leagueId,
        isAdmin: leagueMembers.isAdmin,
      })
      .from(leagueMembers)
      .innerJoin(players, eq(players.id, leagueMembers.playerId))
      .where(inArray(leagueMembers.leagueId, ids))
      .orderBy(asc(leagueMembers.id)),
  );
}

/** The pending invitees of the leagues the viewer administers, by invite id. */
async function inviteesOf(db: Executor, ids: readonly number[]) {
  if (ids.length === 0) return [];
  return inviteeRows.parse(
    await db
      .select({ ...personColumns, league: leagueInvites.leagueId })
      .from(leagueInvites)
      .innerJoin(players, eq(players.id, leagueInvites.inviteeId))
      .where(inArray(leagueInvites.leagueId, ids))
      .orderBy(asc(leagueInvites.id)),
  );
}

/** The viewer's pending invites in every tournament (issue 183). */
async function pendingInvitesOf(
  db: Executor,
  player: PlayerId,
): Promise<PendingInvite[]> {
  return inviteRows
    .parse(
      await db
        .select({
          id: leagueInvites.id,
          leagueName: leagues.name,
          inviter: players.username,
        })
        .from(leagueInvites)
        .innerJoin(leagues, eq(leagues.id, leagueInvites.leagueId))
        .leftJoin(players, eq(players.id, leagueInvites.invitedById))
        .where(eq(leagueInvites.inviteeId, keyOf(player, 'player')))
        .orderBy(asc(leagueInvites.id)),
    )
    .map((row) => ({
      id: row.id,
      leagueName: row.leagueName,
      inviterUsername: row.inviter,
    }));
}

/** The player's leagues in the tournament, each with what the page names of it. */
async function leaguesIn(
  db: Executor,
  player: PlayerId,
  tournament: Tournament,
): Promise<LeagueRows[]> {
  const playerKey = keyOf(player, 'player');
  const mine = mineRows.parse(
    await db
      .select({ league: leagueColumns, member: memberColumns })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .where(
        and(
          eq(leagueMembers.playerId, playerKey),
          eq(leagues.tournamentId, tournament.id),
        ),
      )
      .orderBy(asc(leagueMembers.id)),
  );
  const administered = mine
    .filter(({ member }) => member.isAdmin)
    .map(({ league }) => league.id);
  const [selected, counts, members, invitees] = await Promise.all([
    selectedLeague(db, playerKey, tournament.id),
    memberCounts(
      db,
      mine.map(({ league }) => league.id),
    ),
    membersOf(db, administered),
    inviteesOf(db, administered),
  ]);
  return mine.map(({ league, member }) => ({
    league: readLeague(league, keyOfTournament(tournament)),
    viewerMember: readMember(member),
    selected: selected === league.id,
    memberCount: counts.get(league.id) ?? 0,
    members: members
      .filter((line) => line.league === league.id)
      .map((line) => ({ ...personOf(line), isAdmin: line.isAdmin })),
    pendingInvitees: invitees
      .filter((line) => line.league === league.id)
      .map(personOf),
  }));
}

/**
 * `/leagues` (LeagueController::index): the player's leagues in the
 * tournament (none for no tournament, as sportbet's `whereHas`), the members
 * and pending invitees only of leagues they administer, and every pending
 * invite they hold in any tournament, then the domain's `leaguesPage`. Every
 * row is parsed with the domain's schemas.
 */
export async function loadLeaguesPage(
  db: Executor,
  query: {
    readonly player: PlayerId;
    readonly tournament: Tournament | null;
  },
): Promise<LeaguesPage> {
  return leaguesPage({
    leagues:
      query.tournament === null
        ? []
        : await leaguesIn(db, query.player, query.tournament),
    invites: await pendingInvitesOf(db, query.player),
    viewer: query.player,
  });
}
