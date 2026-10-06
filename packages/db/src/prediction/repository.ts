import {
  MatchPrediction,
  missingResultPredictions,
  PREDICTION_ORIGINS,
  scoreSideInvariant,
  type Instant,
  type PlayerId,
  type RuleSet,
  type Season,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
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
import { TournamentScope } from '../tournament/scope';
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
 * Upserts predictions by player and game. A prediction for a game or of a
 * player that is not one of the tournament's throws (TournamentScope), and
 * none is saved.
 */
export async function saveMatchPredictions(
  db: Executor,
  tournament: Tournament,
  predictions: readonly MatchPrediction[],
): Promise<void> {
  const scope = await TournamentScope.read(db, tournament);
  const save = 'saveMatchPredictions';
  const rows = predictions.map((prediction) => ({
    gameId: scope.game(prediction.game, save),
    playerId: scope.player(prediction.player, save),
    home: prediction.home,
    away: prediction.away,
    origin: prediction.origin,
    filledInAt:
      prediction.filledInAt === null ? null : new Date(prediction.filledInAt),
  }));
  await inChunks(rows, (chunk) =>
    db
      .insert(matchPredictions)
      .values(chunk)
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
 * The tournament's prediction rows - every player's, or one player's -
 * through MatchPrediction.stored; by game, then player.
 */
async function predictionsOf(
  db: Executor,
  tournament: Tournament,
  player: PlayerId | null,
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
    .where(
      and(
        eq(games.tournamentId, tournament.id),
        player === null
          ? undefined
          : eq(matchPredictions.playerId, keyOf(player, 'player')),
      ),
    )
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

/**
 * Every prediction row of the tournament's games, real, filled in and
 * blank, through MatchPrediction.stored; by game, then player.
 */
export function loadMatchPredictions(
  db: Executor,
  tournament: Tournament,
): Promise<MatchPrediction[]> {
  return predictionsOf(db, tournament, null);
}

/** One player's prediction rows of the tournament's games; by game. */
export function loadPlayerPredictions(
  db: Executor,
  player: PlayerId,
  tournament: Tournament,
): Promise<MatchPrediction[]> {
  return predictionsOf(db, tournament, player);
}

/**
 * The "Spėjimai" badge (MissingPredictions::openGamesWithoutAPrediction):
 * how many of the current round's open games the player has not answered,
 * the round under the rule set (LR-3, R-6, R-40).
 */
export async function loadMissingResultPredictions(
  db: Executor,
  input: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    readonly season: Season;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<number> {
  const { player, tournament, season, now, rules } = input;
  return missingResultPredictions({
    season,
    current: season.currentRound(now, rules),
    predictions: await loadPlayerPredictions(db, player, tournament),
    now,
  });
}
