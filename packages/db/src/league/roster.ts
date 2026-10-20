import {
  leagueRoster,
  listedPlayers,
  type PlayerId,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, keyOfTournament, playerOf } from '../edge';
import { loadPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { leagueMembers, leagues } from './schema';

/**
 * Whose rows a table shows (R-73): every listed player of the tournament
 * (sportbet's `PlayerTotals::forTournament`: `/leaderboard`, the hub's
 * panels); the public league at full-member level (`TournamentController::
 * show`'s level 0); or the league the viewer selects, at the viewer's own
 * level (`LeagueRoster::visibleTo`: the game page, the summaries).
 */
export type RosterScope =
  'whole-tournament' | 'public-league' | { readonly selectedBy: PlayerId };

const leagueRows = z.array(z.object({ id: z.int() }));
const viewerRows = z.array(
  z.object({ league: z.int().nullable(), isGuest: z.boolean().nullable() }),
);
const memberRows = z.array(z.object({ player: z.int(), isGuest: z.boolean() }));

async function publicLeagueOf(
  db: Executor,
  tournament: Tournament,
): Promise<number | null> {
  const [found] = leagueRows.parse(
    await db
      .select({ id: leagues.id })
      .from(leagues)
      .where(
        and(
          eq(leagues.tournamentId, tournament.id),
          eq(leagues.isPublic, true),
        ),
      ),
  );
  return found?.id ?? null;
}

/**
 * The viewer's selected league in the tournament and their own level
 * there, or null for a viewer with no row in the tournament.
 */
async function selectedLeagueOf(
  db: Executor,
  tournament: Tournament,
  viewer: PlayerId,
): Promise<{ league: number; viewerIsGuest: boolean } | null> {
  const [found] = viewerRows.parse(
    await db
      .select({
        league: tournamentPlayers.selectedLeagueId,
        isGuest: leagueMembers.isGuest,
      })
      .from(tournamentPlayers)
      .leftJoin(
        leagueMembers,
        and(
          eq(leagueMembers.leagueId, tournamentPlayers.selectedLeagueId),
          eq(leagueMembers.playerId, tournamentPlayers.playerId),
        ),
      )
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournament.id),
          eq(tournamentPlayers.playerId, keyOf(viewer, 'player')),
        ),
      ),
  );
  if (found === undefined) return null;
  if (found.league === null || found.isGuest === null) {
    throw new Error(
      `player ${viewer} selects a league they are not a member of`,
    );
  }
  return { league: found.league, viewerIsGuest: found.isGuest };
}

/**
 * The league a scope reads, or null when there is none to read: a
 * tournament nobody has joined yet has no public league.
 */
export async function rosterLeagueOf(
  db: Executor,
  tournament: Tournament,
  scope: Exclude<RosterScope, 'whole-tournament'>,
): Promise<{ league: number; viewerIsGuest: boolean } | null> {
  if (scope !== 'public-league') {
    const selected = await selectedLeagueOf(db, tournament, scope.selectedBy);
    if (selected !== null) return selected;
  }
  const league = await publicLeagueOf(db, tournament);
  return league === null ? null : { league, viewerIsGuest: false };
}

/**
 * The players a table shows, by scope (RosterScope): `'whole-tournament'`
 * the tournament's listed players (RA-4: R-7, R-19); the other two the
 * members of a league, listed, no more a guest than the viewer
 * (`leagueRoster`). A viewer who plays no part in the tournament - an
 * admin, or a stale link - reads the public league at full-member level.
 */
export async function loadRoster(
  db: Executor,
  tournament: Tournament,
  scope: RosterScope,
): Promise<ReadonlySet<PlayerId>> {
  const statuses = await loadPlayerStatuses(db, tournament);
  const key = keyOfTournament(tournament);
  if (scope === 'whole-tournament') return listedPlayers(statuses, key);
  const read = await rosterLeagueOf(db, tournament, scope);
  if (read === null) return new Set();
  const members = memberRows.parse(
    await db
      .select({
        player: leagueMembers.playerId,
        isGuest: leagueMembers.isGuest,
      })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, read.league)),
  );
  return leagueRoster({
    members: members.map((row) => ({
      player: playerOf(row.player),
      isGuest: row.isGuest,
    })),
    statuses,
    viewerIsGuest: read.viewerIsGuest,
    tournament: key,
  });
}
