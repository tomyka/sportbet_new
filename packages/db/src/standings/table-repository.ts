import {
  StandingsTable,
  type Instant,
  type PlacedTeam,
  type PlayerId,
  type TeamId,
  type TeamPick,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { judgedAt, type DatabaseClock } from '../clock';
import type { Executor, Tx } from '../client';
import { keyOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';
import { teams } from '../team/schema';
import { findTournamentById, tournamentIdRows } from '../tournament/repository';
import { playerRowsIn } from './repository';
import { standingsPredictions } from './schema';

/**
 * A player's standings table, locked, for a save naming `team`: the
 * team's tournament (issue 255: the posted row's, never the request's; a
 * reorder names its first team), of which the player must be a player;
 * their rows of its teams seeded where missing (a team added after joining
 * has none), then locked by team (FOR UPDATE, the lock order's standings
 * step); the season read, and the table built at the moment judged at -
 * the later of `now` and the database's time once the rows are locked.
 * Null: no table of the player's (no such team, or not playing there).
 */
export async function loadLockedStandingsTable(
  tx: Tx,
  input: {
    readonly player: PlayerId;
    readonly team: TeamId;
    readonly now: Instant;
    readonly clock: DatabaseClock;
  },
): Promise<StandingsTable | null> {
  const { player, team, now, clock } = input;
  const [found] = tournamentIdRows.parse(
    await tx
      .select({ tournament: teams.tournamentId })
      .from(teams)
      .where(eq(teams.id, keyOf(team, 'team'))),
  );
  if (found === undefined) return null;
  const playerKey = keyOf(player, 'player');
  const playing = await tx
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(
      and(
        eq(tournamentPlayers.playerId, playerKey),
        eq(tournamentPlayers.tournamentId, found.tournament),
      ),
    );
  if (playing.length === 0) return null;
  const tournament = await findTournamentById(tx, found.tournament);
  if (tournament === undefined) {
    throw new Error(
      `standings table: tournament ${String(found.tournament)} is not stored`,
    );
  }
  const tableTeams = await listTeams(tx, tournament);
  const keys = tableTeams.map(({ id }) => keyOf(id, 'team'));
  await tx
    .insert(standingsPredictions)
    .values(keys.map((teamId) => ({ playerId: playerKey, teamId })))
    .onConflictDoNothing();
  const rows = await playerRowsIn(tx, player, tournament, { lock: true });
  const season = await loadSeason(tx, tournament);
  return StandingsTable.at({
    teams: tableTeams,
    rows,
    season,
    now: await judgedAt(tx, clock, now),
  });
}

/** Writes a decided row save: the row's five columns, as decided. */
export async function writeStandingsRow(
  tx: Executor,
  player: PlayerId,
  row: TeamPick,
): Promise<void> {
  await tx
    .update(standingsPredictions)
    .set({
      place: row.place,
      playOffs: row.playOffs,
      finalFour: row.finalFour,
      finalPlace: row.finalPlace,
    })
    .where(playerRow(player, row.team));
}

/**
 * Writes a decided reorder: each team's place only, so ticks and final
 * places stay.
 */
export async function writeStandingsPlaces(
  tx: Executor,
  player: PlayerId,
  placed: readonly PlacedTeam[],
): Promise<void> {
  for (const { team, place } of placed) {
    await tx
      .update(standingsPredictions)
      .set({ place })
      .where(playerRow(player, team));
  }
}

/** The player's row of a team. */
const playerRow = (player: PlayerId, team: TeamId) =>
  and(
    eq(standingsPredictions.playerId, keyOf(player, 'player')),
    eq(standingsPredictions.teamId, keyOf(team, 'team')),
  );
