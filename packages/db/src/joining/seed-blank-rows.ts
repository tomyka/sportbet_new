import type { GameId, PlayerId, TeamId, Tournament } from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { inChunks, keyOf, playerOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { standingsPredictions } from '../standings/schema';

/** What to seed: the rows of `players` x `games`, and of `players` x `teams`. */
export interface BlankRows {
  /** Whose rows; every player of the tournament when left out. */
  readonly players?: readonly PlayerId[];
  /** The games that get each player a blank prediction row; none when left out. */
  readonly games?: readonly GameId[];
  /** The teams that get each player a blank standings row; none when left out. */
  readonly teams?: readonly TeamId[];
}

const playerRows = z.array(z.object({ player: z.int() }));

/** Every player with a place in the tournament, by id. */
async function playersOf(
  tx: Executor,
  tournament: Tournament,
): Promise<PlayerId[]> {
  const rows = playerRows.parse(
    await tx
      .select({ player: tournamentPlayers.playerId })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id))
      .orderBy(tournamentPlayers.playerId),
  );
  return rows.map(({ player }) => playerOf(player));
}

/**
 * The one place blank prediction rows are made (PredictionRows::seedMissing;
 * with saveResult's fill-ins, the only writer of a `match_predictions` row's
 * first state): a blank match row (a real prediction with no score) for each
 * player and game, and a blank standings row for each player and team, each
 * only where it is missing, so a second call writes nothing. A late joiner,
 * a new game and new teams seed rows through it. In a transaction that
 * already holds the tournament's recalculation lock, with the players'
 * `tournament_players` rows in place.
 */
export async function seedBlankRows(
  tx: Executor,
  tournament: Tournament,
  rows: BlankRows,
): Promise<void> {
  const games = rows.games ?? [];
  const teams = rows.teams ?? [];
  if (games.length === 0 && teams.length === 0) return;
  const players = rows.players ?? (await playersOf(tx, tournament));
  await inChunks(
    players.flatMap((player) =>
      games.map((game) => ({
        playerId: keyOf(player, 'player'),
        gameId: game,
        home: null,
        away: null,
        origin: 'real' as const,
        filledInAt: null,
      })),
    ),
    (chunk) =>
      tx
        .insert(matchPredictions)
        .values(chunk)
        .onConflictDoNothing({
          target: [matchPredictions.playerId, matchPredictions.gameId],
        }),
  );
  await inChunks(
    players.flatMap((player) =>
      teams.map((team) => ({
        playerId: keyOf(player, 'player'),
        teamId: keyOf(team, 'team'),
        place: null,
        playOffs: null,
        finalFour: null,
        finalPlace: null,
      })),
    ),
    (chunk) =>
      tx
        .insert(standingsPredictions)
        .values(chunk)
        .onConflictDoNothing({
          target: [standingsPredictions.playerId, standingsPredictions.teamId],
        }),
  );
}
