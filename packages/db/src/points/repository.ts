import {
  CrowdOdds,
  Odds,
  Points,
  roundNumber,
  StandingsOdds,
  StandingsPoints,
  type GameOdds,
  type PointsRows,
  type StandingsLine,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type Tournament,
} from '@sportbet/domain';
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
import type { Executor } from '../client';
import { advanceIdentitySequences } from '../identity';
import {
  excluded,
  gameOf,
  inChunks,
  keyOf,
  playerOf,
  stored,
  teamOf,
  unitsOf,
} from '../edge';
import { roundIdIn, roundIdsOf } from '../season/repository';
import { games, rounds } from '../season/schema';
import { teams } from '../team/schema';
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

const numericText = z.string();
const oddsRows = z.array(
  z.object({
    game: z.int(),
    home: numericText,
    away: numericText,
    draw: numericText,
  }),
);
const matchRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    winner: numericText,
    margin: numericText,
    bingo: numericText,
    oddsPoints: numericText,
    full: numericText,
    odds: numericText,
    serija: numericText,
  }),
);
const line = numericText.nullable();
const standingsRows = z.array(
  z.object({
    player: z.int(),
    team: z.int(),
    placePoints: line,
    placeOdds: line,
    playOffsPoints: line,
    playOffsOdds: line,
    finalFourPoints: line,
    finalFourOdds: line,
    finalPoints: line,
    finalOdds: line,
  }),
);
const survivalRows = z.array(
  z.object({
    id: z.int(),
    player: z.int(),
    round: z.int(),
    team: z.int(),
    points: numericText.nullable(),
    provisional: z.boolean(),
    storedRowId: z.int().nullable(),
  }),
);

const gamesOf = (db: Executor, tournament: Tournament) =>
  db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.tournamentId, tournament.id));
const teamsOf = (db: Executor, tournament: Tournament) =>
  db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.tournamentId, tournament.id));

const text = (value: { toString(): string } | null): string | null =>
  value === null ? null : value.toString();

/**
 * Replaces the tournament's rows of `source` in the four points tables with
 * `rows`, in one transaction, so saving the same result twice leaves the
 * same rows and the other sources' rows are never touched. `rows` is a
 * TournamentPoints as recalculateTournament returns it, or production's
 * rows read back. A production survival row is the stored row itself: its
 * `storedId` is its own id, sportbet's `point_survivals.id`, kept as the
 * row's id (and upserted, so a derived row that rewrites it keeps its
 * reference); a derived row's `storedId` is the production row it rewrites.
 */
export async function saveTournamentPoints(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
  rows: PointsRows,
): Promise<void> {
  await db.transaction(async (tx) => {
    const roundIds = await roundIdsOf(tx, tournament);
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
    const survival = rows.survival.map((row) => {
      const values = {
        source,
        playerId: keyOf(row.player, 'player'),
        tournamentId: tournament.id,
        roundId: roundIdIn(roundIds, row.round, tournament),
        teamId: keyOf(row.team, 'team'),
        points: text(row.points),
        provisional: row.provisional,
      };
      if (source !== 'production') {
        return { ...values, storedRowId: row.storedId };
      }
      if (row.storedId === null) {
        throw new Error(
          'saveTournamentPoints: a production survival row is a stored row and needs its id',
        );
      }
      return { ...values, id: row.storedId, storedRowId: null };
    });
    const kept: SQL[] = [
      eq(survivalPoints.source, source),
      eq(survivalPoints.tournamentId, tournament.id),
    ];
    const keptIds = survival.flatMap((row) => ('id' in row ? [row.id] : []));
    if (source === 'production' && keptIds.length > 0) {
      kept.push(notInArray(survivalPoints.id, keptIds));
    }
    await tx.delete(survivalPoints).where(and(...kept));

    await inChunks(rows.odds, (chunk) =>
      tx.insert(gameOdds).values(
        chunk.map(({ game, odds }) => ({
          source,
          gameId: game,
          home: odds.home.toString(),
          away: odds.away.toString(),
          draw: odds.draw.toString(),
        })),
      ),
    );
    await inChunks(rows.matches, (chunk) =>
      tx.insert(matchPoints).values(
        chunk.map((row) => ({
          source,
          playerId: keyOf(row.player, 'player'),
          gameId: row.game,
          winner: row.points.winner.toString(),
          margin: row.points.margin.toString(),
          bingo: row.points.bingo.toString(),
          oddsPoints: row.points.oddsPoints.toString(),
          full: row.points.full.toString(),
          odds: row.points.odds.toString(),
          serija: row.serija.toString(),
        })),
      ),
    );
    await inChunks(rows.standings, (chunk) =>
      tx.insert(standingsPoints).values(
        chunk.map((row) => ({
          source,
          playerId: keyOf(row.player, 'player'),
          teamId: keyOf(row.team, 'team'),
          placePoints: text(row.place.points),
          placeOdds: text(row.place.odds),
          playOffsPoints: text(row.playOffs.points),
          playOffsOdds: text(row.playOffs.odds),
          finalFourPoints: text(row.finalFour.points),
          finalFourOdds: text(row.finalFour.odds),
          finalPoints: text(row.final.points),
          finalOdds: text(row.final.odds),
        })),
      ),
    );
    const production = survival.filter((row) => 'id' in row);
    const derived = survival.filter((row) => !('id' in row));
    // A derived row's id is generated: it must never be one a production
    // row was saved under.
    await inChunks(production, (chunk) =>
      tx
        .insert(survivalPoints)
        .overridingSystemValue()
        .values(chunk)
        .onConflictDoUpdate({
          target: survivalPoints.id,
          set: {
            source: excluded(survivalPoints.source),
            playerId: excluded(survivalPoints.playerId),
            tournamentId: excluded(survivalPoints.tournamentId),
            roundId: excluded(survivalPoints.roundId),
            teamId: excluded(survivalPoints.teamId),
            points: excluded(survivalPoints.points),
            provisional: excluded(survivalPoints.provisional),
            storedRowId: excluded(survivalPoints.storedRowId),
          },
        }),
    );
    if (production.length > 0) {
      await advanceIdentitySequences(tx, [survivalPoints]);
    }
    await inChunks(derived, (chunk) => tx.insert(survivalPoints).values(chunk));
  });
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
  return oddsRows.parse(rows).map((row) => {
    const key = `${source}/${String(row.game)}`;
    const odds = (value: string) =>
      stored(
        Odds.ofHundredths(unitsOf(value, 2, 'game_odds', key)),
        'game_odds',
        key,
      );
    return {
      game: gameOf(row.game),
      odds: CrowdOdds.stored(odds(row.home), odds(row.away), odds(row.draw)),
    };
  });
}

/**
 * The tournament's points rows of `source`: odds by game, match points by
 * game then player, standings by player then team, survival by player,
 * round and id. A production survival row's `storedId` is its own id.
 */
export async function loadTournamentPoints(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<PointsRows> {
  const pointsOf = (value: string, table: string, key: string) =>
    stored(Points.ofHundredths(unitsOf(value, 2, table, key)), table, key);

  const matchResult = await db
    .select({
      player: matchPoints.playerId,
      game: matchPoints.gameId,
      winner: matchPoints.winner,
      margin: matchPoints.margin,
      bingo: matchPoints.bingo,
      oddsPoints: matchPoints.oddsPoints,
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
  const matches: StoredMatchRow[] = matchRows.parse(matchResult).map((row) => {
    const key = `${source}/${String(row.player)}/${String(row.game)}`;
    const of = (value: string) => pointsOf(value, 'match_points', key);
    return {
      player: playerOf(row.player),
      game: gameOf(row.game),
      points: {
        winner: of(row.winner),
        margin: of(row.margin),
        bingo: of(row.bingo),
        oddsPoints: of(row.oddsPoints),
        full: of(row.full),
        odds: stored(
          Odds.ofHundredths(unitsOf(row.odds, 2, 'match_points', key)),
          'match_points',
          key,
        ),
      },
      serija: of(row.serija),
    };
  });

  const standingsResult = await db
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
  const standings: StandingsRow[] = standingsRows
    .parse(standingsResult)
    .map((row) => {
      const key = `${source}/${String(row.player)}/${String(row.team)}`;
      const standingsLine = (
        points: string | null,
        odds: string | null,
      ): StandingsLine => ({
        points:
          points === null
            ? null
            : stored(
                StandingsPoints.ofTenThousandths(
                  unitsOf(points, 4, 'standings_points', key),
                ),
                'standings_points',
                key,
              ),
        odds:
          odds === null
            ? null
            : stored(
                StandingsOdds.ofTenThousandths(
                  unitsOf(odds, 4, 'standings_points', key),
                ),
                'standings_points',
                key,
              ),
      });
      return {
        player: playerOf(row.player),
        team: teamOf(row.team),
        place: standingsLine(row.placePoints, row.placeOdds),
        playOffs: standingsLine(row.playOffsPoints, row.playOffsOdds),
        finalFour: standingsLine(row.finalFourPoints, row.finalFourOdds),
        final: standingsLine(row.finalPoints, row.finalOdds),
      };
    });

  const survivalResult = await db
    .select({
      id: survivalPoints.id,
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
      asc(survivalPoints.id),
    );
  const survival: SurvivalPoints[] = survivalRows
    .parse(survivalResult)
    .map((row) => {
      const key = String(row.id);
      return {
        player: playerOf(row.player),
        round: stored(roundNumber(row.round), 'survival_points', key),
        team: teamOf(row.team),
        points:
          row.points === null
            ? null
            : pointsOf(row.points, 'survival_points', key),
        provisional: row.provisional,
        storedId: source === 'production' ? row.id : row.storedRowId,
      };
    });

  return {
    odds: await loadGameOdds(db, tournament, source),
    matches,
    standings,
    survival,
  };
}

/** How many rows of each source each points table holds for the tournament. */
export async function countPointsRows(
  db: Executor,
  tournament: Tournament,
): Promise<Record<PointsTable, Record<PointsSource, number>>> {
  const sourceCounts = z.array(
    z.object({ source: z.enum(POINTS_SOURCES), rows: z.int() }),
  );
  const bySource = (rows: unknown): Record<PointsSource, number> => {
    const parsed = sourceCounts.parse(rows);
    const of = (source: PointsSource) =>
      parsed.find((row) => row.source === source)?.rows ?? 0;
    return {
      production: of('production'),
      sportbet: of('sportbet'),
      ruled: of('ruled'),
    };
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
