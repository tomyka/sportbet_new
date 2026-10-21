import type {
  GameId,
  GameOdds,
  PointsRows,
  Tournament,
} from '@sportbet/domain';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Executor } from '../client';
import { inChunks } from '../edge';
import { rounds } from '../season/schema';
import { gamesOf, teamsOf, TournamentScope } from '../tournament/scope';
import { liveRows } from './live';
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
  standingsPoints,
  survivalPoints,
} from './schema';

/**
 * Replaces the tournament's live rows (LIVE_SOURCE) in the four points
 * tables with `rows`, in one transaction, so saving the same result twice
 * leaves the same rows. The retired `production` and `sportbet` rows are
 * never touched. `rows` is a TournamentPoints as recalculateTournament
 * returns it. A row for a game, team, round or player that is not the
 * tournament's throws (TournamentScope) - its deletes are scoped to the
 * tournament and could never replace it - and nothing is saved.
 */
export async function saveTournamentPoints(
  db: Executor,
  tournament: Tournament,
  rows: PointsRows,
): Promise<void> {
  await db.transaction(async (tx) => {
    await savePointsInScope(
      tx,
      await TournamentScope.read(tx, tournament),
      rows,
    );
  });
}

/**
 * saveTournamentPoints with the scope already read, inside the caller's
 * transaction: for the recalculation, which reads it once for its inputs and
 * for this save.
 */
export async function savePointsInScope(
  tx: Executor,
  scope: TournamentScope,
  rows: PointsRows,
): Promise<void> {
  const values = pointsValues(scope, rows);
  await deleteLiveRows(tx, scope.tournament);
  await insertPointsValues(tx, values);
}

/** The tournament's live rows deleted. */
async function deleteLiveRows(
  tx: Executor,
  tournament: Tournament,
): Promise<void> {
  await tx
    .delete(gameOdds)
    .where(
      and(
        liveRows.gameOdds(),
        inArray(gameOdds.gameId, gamesOf(tx, tournament)),
      ),
    );
  await tx
    .delete(matchPoints)
    .where(
      and(
        liveRows.matchPoints(),
        inArray(matchPoints.gameId, gamesOf(tx, tournament)),
      ),
    );
  await tx
    .delete(standingsPoints)
    .where(
      and(
        liveRows.standingsPoints(),
        inArray(standingsPoints.teamId, teamsOf(tx, tournament)),
      ),
    );
  await tx.delete(survivalPoints).where(and(...survivalScope(tournament)));
}

/** Every table's values inserted. */
async function insertPointsValues(
  tx: Executor,
  values: PointsValues,
): Promise<void> {
  await inChunks(values.odds, (chunk) => tx.insert(gameOdds).values(chunk));
  await inChunks(values.matches, (chunk) =>
    tx.insert(matchPoints).values(chunk),
  );
  await inChunks(values.standings, (chunk) =>
    tx.insert(standingsPoints).values(chunk),
  );
  await inChunks(values.survival, (chunk) =>
    tx.insert(survivalPoints).values(chunk),
  );
}

/**
 * One game's live odds row deleted, so the next recalculation computes them
 * afresh: a result entry scores its game from the votes as they stand (CO-1
 * to CO-6), where only a game scored before keeps the odds it was scored
 * with (R-99).
 */
export async function forgetGameOdds(
  db: Executor,
  game: GameId,
): Promise<void> {
  await db
    .delete(gameOdds)
    .where(and(liveRows.gameOdds(), eq(gameOdds.gameId, game)));
}

/** The tournament's live game odds rows, by game. */
export async function loadGameOdds(
  db: Executor,
  tournament: Tournament,
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
        liveRows.gameOdds(),
        inArray(gameOdds.gameId, gamesOf(db, tournament)),
      ),
    )
    .orderBy(asc(gameOdds.gameId));
  return oddsOf(rows);
}

/**
 * The tournament's live points rows: odds by game, match points by game
 * then player, standings by player then team, survival by player, round
 * and id.
 */
export async function loadTournamentPoints(
  db: Executor,
  tournament: Tournament,
): Promise<PointsRows> {
  return {
    odds: await loadGameOdds(db, tournament),
    matches: matchesOf(await selectMatchRows(db, tournament)),
    standings: standingsOf(await selectStandingsRows(db, tournament)),
    survival: survivalOf(await selectSurvivalRows(db, tournament)),
  };
}

/** The tournament's live match_points rows, by game then player. */
function selectMatchRows(
  db: Executor,
  tournament: Tournament,
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
        liveRows.matchPoints(),
        inArray(matchPoints.gameId, gamesOf(db, tournament)),
      ),
    )
    .orderBy(asc(matchPoints.gameId), asc(matchPoints.playerId));
}

/** The tournament's live standings_points rows, by player then team. */
function selectStandingsRows(
  db: Executor,
  tournament: Tournament,
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
        liveRows.standingsPoints(),
        inArray(standingsPoints.teamId, teamsOf(db, tournament)),
      ),
    )
    .orderBy(asc(standingsPoints.playerId), asc(standingsPoints.teamId));
}

/** The tournament's live survival_points rows, by player, round and id. */
function selectSurvivalRows(
  db: Executor,
  tournament: Tournament,
): Promise<unknown> {
  return survivalRowsOf(db)
    .where(and(...survivalScope(tournament)))
    .orderBy(...SURVIVAL_ROW_ORDER);
}

/** Live survival_points rows in one tournament. */
function survivalScope(tournament: Tournament): readonly SQL[] {
  return [
    liveRows.survivalPoints(),
    eq(survivalPoints.tournamentId, tournament.id),
  ];
}

/** The columns a survival row is read with, still to be scoped and ordered. */
function survivalRowsOf(db: Executor) {
  return db
    .select({
      id: survivalPoints.id,
      player: survivalPoints.playerId,
      round: rounds.number,
      team: survivalPoints.teamId,
      points: survivalPoints.points,
      provisional: survivalPoints.provisional,
    })
    .from(survivalPoints)
    .innerJoin(rounds, eq(rounds.id, survivalPoints.roundId));
}

const SURVIVAL_ROW_ORDER = [
  asc(survivalPoints.playerId),
  asc(rounds.number),
  asc(survivalPoints.id),
];
