import {
  CrowdOdds,
  MatchPrediction,
  predictMatch,
  PREDICTION_ORIGINS,
  scoreSideInvariant,
  statusAfterSave,
  tournamentId,
  type GameId,
  type Instant,
  type PlayerId,
  type PredictRefusal,
  type Rate,
  type Result,
  type RuleSet,
  type TournamentStatusRow,
  ok,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, instantOf, keyOf, playerOf, stored } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { findTournamentById } from '../tournament/repository';
import { auditPredictionGames, matchPredictions } from './schema';

/** One save, as the form has passed it (predictionFormEntry). */
export interface PredictionSave {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly entry: {
    readonly home: number | null;
    readonly away: number | null;
  };
  readonly now: Instant;
  readonly rules: RuleSet;
}

/** What the save answers with: the game's odds from its votes now, and its round's rate. */
export interface PredictionSaved {
  readonly odds: CrowdOdds;
  readonly rate: Rate;
}

const side = scoreSideInvariant.schema.nullable();
const targetRows = z.array(
  z.object({
    tournament: z.int(),
    home: side,
    away: side,
    origin: z.enum(PREDICTION_ORIGINS),
    filledInAt: z.date().nullable(),
  }),
);
const statusRows = z.array(
  z.object({
    tournament: z.int(),
    switchedOff: z.boolean(),
    adminHidden: z.boolean(),
    fillIns: z.int(),
  }),
);
const voteRows = z.array(
  z.object({
    player: z.int(),
    home: side,
    away: side,
    origin: z.enum(PREDICTION_ORIGINS),
  }),
);

/**
 * PredictionResultController::updatePredictionResultUser in one
 * transaction (a savepoint when `db` is one). The player's row of the game
 * is locked for the rest of it; with none, the save is "not yours" (issue
 * 254). The domain decides (predictMatch) from the row and the game as
 * stored; then the row is written as a real prediction, the player's
 * status where the save switches them back on (statusAfterSave), and an
 * audit row for a saved score. The answer's odds are the game's votes now
 * (CrowdOdds.forGame): nothing is stored for them (odds on read; game_odds
 * holds what a scored game was scored with).
 */
export async function savePrediction(
  db: Executor,
  save: PredictionSave,
): Promise<Result<PredictionSaved, PredictRefusal>> {
  const { player, game, entry, now, rules } = save;
  const playerKey = keyOf(player, 'player');
  return db.transaction(
    async (tx): Promise<Result<PredictionSaved, PredictRefusal>> => {
      const [row] = targetRows.parse(
        await tx
          .select({
            tournament: games.tournamentId,
            home: matchPredictions.home,
            away: matchPredictions.away,
            origin: matchPredictions.origin,
            filledInAt: matchPredictions.filledInAt,
          })
          .from(matchPredictions)
          .innerJoin(games, eq(games.id, matchPredictions.gameId))
          .where(
            and(
              eq(matchPredictions.playerId, playerKey),
              eq(matchPredictions.gameId, game),
            ),
          )
          .for('update', { of: matchPredictions }),
      );
      if (row === undefined) {
        const refused = predictMatch({ target: null, entry, now, rules });
        if (refused.ok) {
          throw new Error('savePrediction: a save with no row was accepted');
        }
        return refused;
      }
      const tournament = await findTournamentById(tx, row.tournament);
      if (tournament === undefined) {
        throw new Error(
          `savePrediction: tournament ${String(row.tournament)} is not stored`,
        );
      }
      const season = await loadSeason(tx, tournament);
      const scheduled = season.game(game);
      const round =
        scheduled === undefined ? undefined : season.round(scheduled.round);
      if (scheduled === undefined || round === undefined) {
        throw new Error(
          `savePrediction: game ${String(game)} is not in its season`,
        );
      }
      const key = `${String(playerKey)}/${String(game)}`;
      const prediction = stored(
        MatchPrediction.stored({
          player,
          game,
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
      const decided = predictMatch({
        target: { prediction, game: scheduled },
        entry,
        now,
        rules,
      });
      if (!decided.ok) return decided;
      const written = decided.value;
      await tx
        .update(matchPredictions)
        .set({
          home: written.prediction.home,
          away: written.prediction.away,
          origin: 'real',
          filledInAt: null,
        })
        .where(
          and(
            eq(matchPredictions.playerId, playerKey),
            eq(matchPredictions.gameId, game),
          ),
        );
      if (written.switchesBackOn) {
        await switchBackOn(tx, playerKey, tournament.id, rules);
      }
      if (written.audit !== null) {
        await tx.insert(auditPredictionGames).values({
          playerId: playerKey,
          gameId: game,
          home: written.audit.new.home,
          away: written.audit.new.away,
          oldHome: written.audit.old.home,
          oldAway: written.audit.old.away,
          at: new Date(now),
        });
      }
      const votes = voteRows
        .parse(
          await tx
            .select({
              player: matchPredictions.playerId,
              home: matchPredictions.home,
              away: matchPredictions.away,
              origin: matchPredictions.origin,
            })
            .from(matchPredictions)
            .where(eq(matchPredictions.gameId, game)),
        )
        .map((vote) => {
          const each = stored(
            MatchPrediction.stored({
              player: playerOf(vote.player),
              game: gameOf(game),
              home: vote.home,
              away: vote.away,
              origin: vote.origin,
              filledInAt: null,
            }),
            'match_predictions',
            `${String(vote.player)}/${String(game)}`,
          );
          return { origin: each.origin, outcome: each.outcome };
        });
      return ok({ odds: CrowdOdds.forGame(votes, rules), rate: round.rate });
    },
  );
}

/** Writes the player's tournament rows statusAfterSave changes, and only those. */
async function switchBackOn(
  tx: Executor,
  playerKey: number,
  tournament: number,
  rules: RuleSet,
): Promise<void> {
  const rows = statusRows.parse(
    await tx
      .select({
        tournament: tournamentPlayers.tournamentId,
        switchedOff: tournamentPlayers.switchedOff,
        adminHidden: tournamentPlayers.adminHidden,
        fillIns: tournamentPlayers.fillIns,
      })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.playerId, playerKey)),
  );
  const keyed = (id: number) =>
    stored(tournamentId(String(id)), 'tournament_players', id);
  const before: TournamentStatusRow[] = rows.map((row) => ({
    tournament: keyed(row.tournament),
    switchedOff: row.switchedOff,
    adminHidden: row.adminHidden,
    fillIns: row.fillIns,
  }));
  const after = statusAfterSave(before, keyed(tournament), rules);
  for (const [index, next] of after.entries()) {
    const was = before[index];
    if (
      was === undefined ||
      (was.switchedOff === next.switchedOff &&
        was.adminHidden === next.adminHidden &&
        was.fillIns === next.fillIns)
    ) {
      continue;
    }
    await tx
      .update(tournamentPlayers)
      .set({
        switchedOff: next.switchedOff,
        adminHidden: next.adminHidden,
        fillIns: next.fillIns,
      })
      .where(
        and(
          eq(tournamentPlayers.playerId, playerKey),
          eq(tournamentPlayers.tournamentId, Number(next.tournament)),
        ),
      );
  }
}
