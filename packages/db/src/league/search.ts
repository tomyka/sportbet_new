import {
  ok,
  personNameInvariant,
  playerId,
  refuse,
  usernameInvariant,
  type LeagueId,
  type PlayerId,
  type Result,
  type RuleSet,
} from '@sportbet/domain';
import { and, asc, eq, exists, notExists, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { players } from '../player/players';
import { tournamentPlayers } from '../player/schema';
import { leagueInvites, leagueMembers, leagues } from './schema';

/** Fewer characters than this answer nothing (sportbet's `strlen < 2`, R-120: characters). */
const MINIMUM_CHARACTERS = 2;
/** LeagueController::searchUsers `limit(10)`. */
const RESULT_LIMIT = 10;

/** A player a league admin may invite: never more than these four fields, never an address. */
export interface FoundPlayer {
  readonly id: PlayerId;
  readonly username: string;
  readonly name: string;
  readonly surname: string;
}

const adminRows = z.array(z.object({ tournament: z.int() }));

const foundRows = z.array(
  z.object({
    id: z.int(),
    username: usernameInvariant.schema,
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
  }),
);

/** Whether the folded column contains the folded query, as plain text: `%` and `_` act as themselves (R-120). */
const contains = (column: AnyPgColumn, query: string) =>
  sql`position(name_fold(${query}) in name_fold(${column})) > 0`;

/** The league's tournament when the actor is an admin of the league, else null. */
async function adminTournament(
  db: Executor,
  league: LeagueId,
  actor: PlayerId,
): Promise<number | null> {
  const [admin] = adminRows.parse(
    await db
      .select({ tournament: leagues.tournamentId })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .where(
        and(
          eq(leagueMembers.leagueId, league),
          eq(leagueMembers.playerId, keyOf(actor, 'player')),
          eq(leagueMembers.isAdmin, true),
        ),
      ),
  );
  return admin?.tournament ?? null;
}

/**
 * Whether the player is an admin member of the league: false for a league
 * that is not there, a non-member and a non-admin. The cheap read a handler
 * gates on before it validates a form (sportbet answers 404 first).
 */
export async function isLeagueAdmin(
  db: Executor,
  check: { readonly actor: PlayerId; readonly league: LeagueId },
): Promise<boolean> {
  return (await adminTournament(db, check.league, check.actor)) !== null;
}

/** The query matches the name, the surname or the username; nothing else of a player is read. */
const matches = (query: string) =>
  sql`name_fold(${query}) <> '' and (${contains(players.name, query)} or ${contains(players.surname, query)} or ${contains(players.username, query)})`;

/** Not already in the league and not already invited to it. */
const invitable = (db: Executor, league: LeagueId) => [
  notExists(
    db
      .select({ one: sql`1` })
      .from(leagueMembers)
      .where(
        and(
          eq(leagueMembers.leagueId, league),
          eq(leagueMembers.playerId, players.id),
        ),
      ),
  ),
  notExists(
    db
      .select({ one: sql`1` })
      .from(leagueInvites)
      .where(
        and(
          eq(leagueInvites.leagueId, league),
          eq(leagueInvites.inviteeId, players.id),
        ),
      ),
  ),
];

/** Plays the tournament (R-88's `tournament-players`). */
const playsTournament = (db: Executor, tournament: number) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournament),
          eq(tournamentPlayers.playerId, players.id),
        ),
      ),
  );

/**
 * LeagueController::searchUsers: the players a league admin may invite.
 * The actor must be an admin of the league (sportbet's 404, also for a
 * league that does not exist); then a query under two characters answers
 * none (R-120); then at most 10 players whose name, surname or username
 * contains the query, ignoring case and accent (`name_fold`; never an
 * address), members and pending invitees left out, by player id. Under
 * `memberSearch: 'tournament-players'` (R-88) only players of the league's
 * tournament are found, otherwise every account is.
 */
export async function searchPlayers(
  db: Executor,
  search: {
    readonly league: LeagueId;
    readonly actor: PlayerId;
    readonly query: string;
    readonly rules: RuleSet;
  },
): Promise<Result<readonly FoundPlayer[], 'not-an-admin'>> {
  const tournament = await adminTournament(db, search.league, search.actor);
  if (tournament === null) return refuse('not-an-admin');
  if (Array.from(search.query).length < MINIMUM_CHARACTERS) return ok([]);
  const rows = foundRows.parse(
    await db
      .select({
        id: players.id,
        username: players.username,
        name: players.name,
        surname: players.surname,
      })
      .from(players)
      .where(
        and(
          matches(search.query),
          ...invitable(db, search.league),
          search.rules.memberSearch === 'tournament-players'
            ? playsTournament(db, tournament)
            : undefined,
        ),
      )
      .orderBy(asc(players.id))
      .limit(RESULT_LIMIT),
  );
  return ok(
    rows.map((row) => ({
      ...row,
      id: stored(playerId(String(row.id)), 'players', row.id),
    })),
  );
}
