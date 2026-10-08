import type { GameOdds, PointsRows, Tournament } from '@sportbet/domain';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  notInArray,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Executor, Tx } from '../client';
import { excluded, inChunks } from '../edge';
import { rounds } from '../season/schema';
import { gamesOf, teamsOf, TournamentScope } from '../tournament/scope';
import {
  matchesOf,
  oddsOf,
  pointsValues,
  standingsOf,
  survivalOf,
  type PointsValues,
} from './rows';
import {
  gameOdds,
  matchPoints,
  POINTS_SOURCES,
  standingsPoints,
  survivalPoints,
  type PointsSource,
} from './schema';

/** The four points tables, as the load report counts them. */
export const POINTS_TABLES = [
  'game_odds',
  'match_points',
  'standings_points',
  'survival_points',
] as const;

export type PointsTable = (typeof POINTS_TABLES)[number];

/**
 * Replaces the tournament's rows of `source` in the four points tables with
 * `rows`, in one transaction, so saving the same result twice leaves the
 * same rows and the other sources' rows are never touched. `rows` is a
 * TournamentPoints as recalculateTournament returns it, or production's
 * rows read back. A production survival row is the stored row itself: its
 * `storedId` is sportbet's `point_survivals.id`, kept as its `sportbet_id`
 * (and upserted on it, so a derived row that rewrites it keeps its
 * reference); a derived row's `storedId` is the production row it rewrites.
 * Only a production row holds a `sportbet_id`, so the upsert can never land
 * on a derived row, whatever ids a later dump brings. A row for a game,
 * team, round or player that is not the tournament's throws
 * (TournamentScope) - its deletes are scoped to the tournament and could
 * never replace it - and nothing is saved.
 */
export async function saveTournamentPoints(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
  rows: PointsRows,
): Promise<void> {
  await db.transaction(async (tx) => {
    const scope = await TournamentScope.read(tx, tournament);
    const values = pointsValues(scope, source, rows);
    const keptIds = values.survival.flatMap((row) =>
      row.sportbetId === null ? [] : [row.sportbetId],
    );
    await deleteSourceRows(tx, { tournament, source, keptIds });
    await insertPointsValues(tx, values);
  });
}

/**
 * The tournament's rows of `source` deleted, except the production
 * survival rows about to be upserted on their sportbet ids.
 */
async function deleteSourceRows(
  tx: Tx,
  scoped: {
    readonly tournament: Tournament;
    readonly source: PointsSource;
    readonly keptIds: readonly number[];
  },
): Promise<void> {
  const { tournament, source, keptIds } = scoped;
  await tx
    .delete(gameOdds)
    .where(
      and(
        eq(gameOdds.source, source),
        inArray(gameOdds.gameId, gamesOf(tx, tournament)),
      ),
    );
  await tx
    .delete(matchPoints)
    .where(
      and(
        eq(matchPoints.source, source),
        inArray(matchPoints.gameId, gamesOf(tx, tournament)),
      ),
    );
  await tx
    .delete(standingsPoints)
    .where(
      and(
        eq(standingsPoints.source, source),
        inArray(standingsPoints.teamId, teamsOf(tx, tournament)),
      ),
    );
  const kept: SQL[] = [
    eq(survivalPoints.source, source),
    eq(survivalPoints.tournamentId, tournament.id),
  ];
  if (keptIds.length > 0) {
    kept.push(notInArray(survivalPoints.sportbetId, [...keptIds]));
  }
  await tx.delete(survivalPoints).where(and(...kept));
}

/** Every table's values inserted; production survival rows upserted on their sportbet id. */
async function insertPointsValues(tx: Tx, values: PointsValues): Promise<void> {
  await inChunks(values.odds, (chunk) => tx.insert(gameOdds).values(chunk));
  await inChunks(values.matches, (chunk) =>
    tx.insert(matchPoints).values(chunk),
  );
  await inChunks(values.standings, (chunk) =>
    tx.insert(standingsPoints).values(chunk),
  );
  const production = values.survival.filter((row) => row.sportbetId !== null);
  const derived = values.survival.filter((row) => row.sportbetId === null);
  // A sportbet id saved before under another tournament moves to this
  // one, unless a derived row still rewrites it: its foreign key
  // (tournament_id, stored_row_id) then refuses the move.
  await inChunks(production, (chunk) =>
    tx
      .insert(survivalPoints)
      .values(chunk)
      .onConflictDoUpdate({
        target: survivalPoints.sportbetId,
        set: {
          playerId: excluded(survivalPoints.playerId),
          tournamentId: excluded(survivalPoints.tournamentId),
          roundId: excluded(survivalPoints.roundId),
          teamId: excluded(survivalPoints.teamId),
          points: excluded(survivalPoints.points),
          provisional: excluded(survivalPoints.provisional),
        },
      }),
  );
  await inChunks(derived, (chunk) => tx.insert(survivalPoints).values(chunk));
}

/** The tournament's game odds rows of `source`, by game. */
export async function loadGameOdds(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<GameOdds[]> {
  const rows = await db
    .select({
      game: gameOdds.gameId,
      home: gameOdds.home,
      away: gameOdds.away,
      draw: gameOdds.draw,
    })
    .from(gameOdds)
    .where(
      and(
        eq(gameOdds.source, source),
        inArray(gameOdds.gameId, gamesOf(db, tournament)),
      ),
    )
    .orderBy(asc(gameOdds.gameId));
  return oddsOf(rows, source);
}

/**
 * The tournament's points rows of `source`: odds by game, match points by
 * game then player, standings by player then team, survival by player,
 * round and stored id. A production survival row's `storedId` is its
 * `sportbet_id`, a derived row's the `stored_row_id` it rewrites.
 */
export async function loadTournamentPoints(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<PointsRows> {
  return {
    odds: await loadGameOdds(db, tournament, source),
    matches: matchesOf(await selectMatchRows(db, tournament, source), source),
    standings: standingsOf(
      await selectStandingsRows(db, tournament, source),
      source,
    ),
    survival: survivalOf(
      await selectSurvivalRows(db, tournament, source),
      source,
    ),
  };
}

/** The tournament's match_points rows of `source`, by game then player. */
function selectMatchRows(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<unknown> {
  return db
    .select({
      player: matchPoints.playerId,
      game: matchPoints.gameId,
      winner: matchPoints.winner,
      margin: matchPoints.margin,
      bingo: matchPoints.bingo,
      full: matchPoints.full,
      odds: matchPoints.odds,
      serija: matchPoints.serija,
    })
    .from(matchPoints)
    .where(
      and(
        eq(matchPoints.source, source),
        inArray(matchPoints.gameId, gamesOf(db, tournament)),
      ),
    )
    .orderBy(asc(matchPoints.gameId), asc(matchPoints.playerId));
}

/** The tournament's standings_points rows of `source`, by player then team. */
function selectStandingsRows(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<unknown> {
  return db
    .select({
      player: standingsPoints.playerId,
      team: standingsPoints.teamId,
      placePoints: standingsPoints.placePoints,
      placeOdds: standingsPoints.placeOdds,
      playOffsPoints: standingsPoints.playOffsPoints,
      playOffsOdds: standingsPoints.playOffsOdds,
      finalFourPoints: standingsPoints.finalFourPoints,
      finalFourOdds: standingsPoints.finalFourOdds,
      finalPoints: standingsPoints.finalPoints,
      finalOdds: standingsPoints.finalOdds,
    })
    .from(standingsPoints)
    .where(
      and(
        eq(standingsPoints.source, source),
        inArray(standingsPoints.teamId, teamsOf(db, tournament)),
      ),
    )
    .orderBy(asc(standingsPoints.playerId), asc(standingsPoints.teamId));
}

/**
 * The tournament's survival_points rows of `source`, by player, round and
 * stored id.
 */
function selectSurvivalRows(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<unknown> {
  return db
    .select({
      id: survivalPoints.id,
      sportbetId: survivalPoints.sportbetId,
      player: survivalPoints.playerId,
      round: rounds.number,
      team: survivalPoints.teamId,
      points: survivalPoints.points,
      provisional: survivalPoints.provisional,
      storedRowId: survivalPoints.storedRowId,
    })
    .from(survivalPoints)
    .innerJoin(rounds, eq(rounds.id, survivalPoints.roundId))
    .where(
      and(
        eq(survivalPoints.source, source),
        eq(survivalPoints.tournamentId, tournament.id),
      ),
    )
    .orderBy(
      asc(survivalPoints.playerId),
      asc(rounds.number),
      asc(survivalPoints.sportbetId),
      asc(survivalPoints.storedRowId),
      asc(survivalPoints.id),
    );
}

/** How many rows of each source each points table holds for the tournament. */
export async function countPointsRows(
  db: Executor,
  tournament: Tournament,
): Promise<Record<PointsTable, Record<PointsSource, number>>> {
  const sourceCounts = z.array(
    z.object({ source: z.enum(POINTS_SOURCES), rows: z.int() }),
  );
  const everySource = z.record(z.enum(POINTS_SOURCES), z.int());
  const bySource = (rows: unknown): Record<PointsSource, number> => {
    const parsed = sourceCounts.parse(rows);
    return everySource.parse(
      Object.fromEntries(
        POINTS_SOURCES.map((source) => [
          source,
          parsed.find((row) => row.source === source)?.rows ?? 0,
        ]),
      ),
    );
  };
  return {
    game_odds: bySource(
      await db
        .select({ source: gameOdds.source, rows: count() })
        .from(gameOdds)
        .where(inArray(gameOdds.gameId, gamesOf(db, tournament)))
        .groupBy(gameOdds.source),
    ),
    match_points: bySource(
      await db
        .select({ source: matchPoints.source, rows: count() })
        .from(matchPoints)
        .where(inArray(matchPoints.gameId, gamesOf(db, tournament)))
        .groupBy(matchPoints.source),
    ),
    standings_points: bySource(
      await db
        .select({ source: standingsPoints.source, rows: count() })
        .from(standingsPoints)
        .where(inArray(standingsPoints.teamId, teamsOf(db, tournament)))
        .groupBy(standingsPoints.source),
    ),
    survival_points: bySource(
      await db
        .select({ source: survivalPoints.source, rows: count() })
        .from(survivalPoints)
        .where(eq(survivalPoints.tournamentId, tournament.id))
        .groupBy(survivalPoints.source),
    ),
  };
}
