import {
  MatchPrediction,
  PREDICTION_ORIGINS,
  scoreSideInvariant,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import {
  excluded,
  gameOf,
  inChunks,
  instantOf,
  keyOf,
  playerOf,
  stored,
} from '../edge';
import { games } from '../season/schema';
import { matchPredictions } from './schema';

const predictionRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    home: scoreSideInvariant.schema.nullable(),
    away: scoreSideInvariant.schema.nullable(),
    origin: z.enum(PREDICTION_ORIGINS),
    filledInAt: z.date().nullable(),
  }),
);

/**
 * Upserts predictions by player and game. A prediction for a game that is
 * not one of the tournament's is a programmer error: it throws, and none
 * is saved.
 */
export async function saveMatchPredictions(
  db: Executor,
  tournament: Tournament,
  predictions: readonly MatchPrediction[],
): Promise<void> {
  const own = new Set(
    z
      .array(z.object({ id: z.int() }))
      .parse(
        await db
          .select({ id: games.id })
          .from(games)
          .where(eq(games.tournamentId, tournament.id)),
      )
      .map(({ id }) => id),
  );
  const stray = predictions.find((prediction) => !own.has(prediction.game));
  if (stray !== undefined) {
    throw new Error(
      `saveMatchPredictions: game ${String(stray.game)} is not a game of tournament ${String(tournament.id)}`,
    );
  }
  await inChunks(predictions, (chunk) =>
    db
      .insert(matchPredictions)
      .values(
        chunk.map((prediction) => ({
          playerId: keyOf(prediction.player, 'player'),
          gameId: prediction.game,
          home: prediction.home,
          away: prediction.away,
          origin: prediction.origin,
          filledInAt:
            prediction.filledInAt === null
              ? null
              : new Date(prediction.filledInAt),
        })),
      )
      .onConflictDoUpdate({
        target: [matchPredictions.playerId, matchPredictions.gameId],
        set: {
          home: excluded(matchPredictions.home),
          away: excluded(matchPredictions.away),
          origin: excluded(matchPredictions.origin),
          filledInAt: excluded(matchPredictions.filledInAt),
        },
      }),
  );
}

/**
 * Every prediction row of the tournament's games, real, filled in and
 * blank, through MatchPrediction.stored; by game, then player.
 */
export async function loadMatchPredictions(
  db: Executor,
  tournament: Tournament,
): Promise<MatchPrediction[]> {
  const rows = await db
    .select({
      player: matchPredictions.playerId,
      game: matchPredictions.gameId,
      home: matchPredictions.home,
      away: matchPredictions.away,
      origin: matchPredictions.origin,
      filledInAt: matchPredictions.filledInAt,
    })
    .from(matchPredictions)
    .innerJoin(games, eq(games.id, matchPredictions.gameId))
    .where(eq(games.tournamentId, tournament.id))
    .orderBy(asc(matchPredictions.gameId), asc(matchPredictions.playerId));
  return predictionRows.parse(rows).map((row) => {
    const key = `${String(row.player)}/${String(row.game)}`;
    return stored(
      MatchPrediction.stored({
        player: playerOf(row.player),
        game: gameOf(row.game),
        home: row.home,
        away: row.away,
        origin: row.origin,
        filledInAt:
          row.filledInAt === null
            ? null
            : instantOf(row.filledInAt, 'match_predictions', key),
      }),
      'match_predictions',
      key,
    );
  });
}
