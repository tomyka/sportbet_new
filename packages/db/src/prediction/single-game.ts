import {
  predictionRowState,
  scoreSideInvariant,
  type GameId,
  type Instant,
  type PredictedPair,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { findVisibleTournament, type PlayerViewer } from '../hub/repository';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { teamNamesOf } from '../team/repository';
import { findTournamentById } from '../tournament/repository';
import { matchPredictions } from './schema';

/** One game's prediction page. */
export interface SingleGame {
  readonly tournament: Tournament;
  readonly home: string;
  readonly away: string;
  readonly tipOff: Instant;
  /** No longer open (GameLock::isClosed, with R-13 and R-41). */
  readonly locked: boolean;
  /** The player's row, or null when they have none ("Spėjimas nerastas"). */
  readonly prediction: PredictedPair | null;
}

const side = scoreSideInvariant.schema.nullable();

/**
 * PredictionResultController::showSingleGame: the game, if it exists and
 * its tournament is one the viewer may see (R-50: the page answers "not
 * found" otherwise, as the tournament page does); its teams and tip-off,
 * whether it is locked (predictionRowState), and the player's row of it.
 * sportbet resolves the format from the game, not the session: so does
 * this, from the game's own tournament.
 */
export async function loadSingleGame(
  db: Executor,
  input: {
    readonly viewer: PlayerViewer;
    readonly game: GameId;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<SingleGame | null> {
  const { viewer, game, now, rules } = input;
  const [found] = z
    .array(z.object({ tournament: z.int() }))
    .parse(
      await db
        .select({ tournament: games.tournamentId })
        .from(games)
        .where(eq(games.id, game)),
    );
  if (found === undefined) return null;
  const tournament = await findTournamentById(db, found.tournament);
  if (tournament === undefined) {
    throw new Error(
      `single game: tournament ${String(found.tournament)} is not stored`,
    );
  }
  if (
    (await findVisibleTournament(db, tournament.slug, viewer, rules)) === null
  ) {
    return null;
  }
  const season = await loadSeason(db, tournament);
  const scheduled = season.game(game);
  if (scheduled === undefined) {
    throw new Error(`single game: game ${String(game)} is not in its season`);
  }
  const nameOf = await teamNamesOf(db, tournament);
  const [row] = z.array(z.object({ home: side, away: side })).parse(
    await db
      .select({ home: matchPredictions.home, away: matchPredictions.away })
      .from(matchPredictions)
      .where(
        and(
          eq(matchPredictions.playerId, keyOf(viewer.player, 'player')),
          eq(matchPredictions.gameId, game),
        ),
      ),
  );
  return {
    tournament,
    home: nameOf(scheduled.home),
    away: nameOf(scheduled.away),
    tipOff: scheduled.tipOff,
    locked: predictionRowState(scheduled, now) !== 'open',
    prediction: row === undefined ? null : { home: row.home, away: row.away },
  };
}
