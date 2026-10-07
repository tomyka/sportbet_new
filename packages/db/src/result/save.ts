import {
  enterResult,
  mistakenFillInsRemoved,
  resultFillIns,
  resultFormEntry,
  tournamentId,
  type FillInCandidateRows,
  type FillInDice,
  type FillInMade,
  type GameId,
  type Instant,
  type ResultFieldError,
  type RuleSet,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { predictionColumns, storedPredictions } from '../prediction/repository';
import { matchPredictions } from '../prediction/schema';
import { databaseClock, type DatabaseClock } from '../prediction/save';
import { recalculateUnderRuleSet } from '../recalculation/repository';
import { loadSeason, saveGames } from '../season/repository';
import { games } from '../season/schema';
import { findTournamentById } from '../tournament/repository';

/** One result as posted: the game, and the two boxes as typed (trimmed). */
export interface ResultSave {
  readonly game: GameId;
  readonly boxes: { readonly home: string; readonly away: string };
  readonly now: Instant;
  readonly rules: RuleSet;
  readonly dice: FillInDice;
}

/** Why a result was not saved. */
export type ResultSaveRefusal =
  | { readonly kind: 'fields'; readonly errors: readonly ResultFieldError[] }
  | { readonly kind: 'no-game' }
  | { readonly kind: 'not-started' }
  | { readonly kind: 'level' }
  | { readonly kind: 'frozen' };

/**
 * The save's answer. Not a domain Result: one refusal carries the boxes'
 * errors (as resultFormEntry's check does), so a refusal is an object.
 */
export type ResultSaveOutcome =
  | { readonly ok: true; readonly value: null }
  | { readonly ok: false; readonly refusal: ResultSaveRefusal };

const saved: ResultSaveOutcome = { ok: true, value: null };
const refused = (refusal: ResultSaveRefusal): ResultSaveOutcome => ({
  ok: false,
  refusal,
});

const gameRows = z.array(z.object({ tournament: z.int() }));

/**
 * ResultController::updateResult in one transaction. The posted boxes
 * first (resultFormEntry, no database read); then the game row, locked
 * FOR UPDATE for the rest of the transaction (#20's F1: a prediction save
 * takes it FOR SHARE and waits, then finds the game closed); judged at the
 * later of `now` and the database's time once the lock is held. A finished
 * tournament is refused (R-22, decision 7). Then:
 * - the game's new state (enterResult) written;
 * - on a correction, FI-4's mistaken fill-ins removed (R-5);
 * - on a score, the blank rows filled in (FI-1, R-32, R-39) and counted
 *   (R-7), each player's status rows locked through lockPlayerStatuses,
 *   players in id order;
 * - the tournament recalculated under `rules` (recalculateUnderRuleSet),
 *   whose refusal is an inconsistent database: it throws, all rolled back.
 *
 * Lock order: the game row, the game's match_predictions rows (FOR
 * UPDATE, by player), each player's tournament_players rows.
 */
export async function saveResult(
  db: Executor,
  save: ResultSave,
  clock: DatabaseClock = databaseClock,
): Promise<ResultSaveOutcome> {
  const { game: id, boxes, now, rules, dice } = save;
  const form = resultFormEntry(boxes);
  if (!form.ok) return refused({ kind: 'fields', errors: form.errors });
  return db.transaction(async (tx): Promise<ResultSaveOutcome> => {
    const [locked] = gameRows.parse(
      await tx
        .select({ tournament: games.tournamentId })
        .from(games)
        .where(eq(games.id, id))
        .for('update'),
    );
    if (locked === undefined) return refused({ kind: 'no-game' });
    const tournament = await findTournamentById(tx, locked.tournament);
    if (tournament === undefined) {
      throw new Error(
        `saveResult: tournament ${String(locked.tournament)} is not stored`,
      );
    }
    const season = await loadSeason(tx, tournament);
    const game = season.game(id);
    if (game === undefined) {
      throw new Error(`saveResult: game ${String(id)} is not in its season`);
    }
    const lockedAt = await clock(tx);
    const judgedAt = lockedAt > now ? lockedAt : now;
    if (!season.mayRecalculateAt(judgedAt, rules)) {
      return refused({ kind: 'frozen' });
    }
    const entered = enterResult({
      game,
      entry: form.value,
      now: judgedAt,
      rules,
    });
    if (!entered.ok) return refused({ kind: entered.refusal });
    await saveGames(tx, tournament, [entered.value.game]);
    const key = stored(
      tournamentId(String(tournament.id)),
      'tournaments',
      tournament.id,
    );
    const candidates = await candidatesOf(tx, id);
    if (entered.value.corrected) {
      await writeMade(
        tx,
        mistakenFillInsRemoved({
          game: entered.value.game,
          tournament: key,
          candidates,
          rules,
        }),
      );
    }
    if (entered.value.scored) {
      await writeMade(
        tx,
        resultFillIns({
          game: entered.value.game,
          tournament: key,
          candidates: await candidatesOf(tx, id),
          dice,
          madeAt: judgedAt,
          rules,
        }),
      );
    }
    const refusal = await recalculateUnderRuleSet(tx, tournament, rules);
    if (refusal !== null) {
      throw new Error(
        `saveResult: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
      );
    }
    return saved;
  });
}

/**
 * The game's prediction rows, locked FOR UPDATE by player, each with the
 * player's tournament_players rows locked through lockPlayerStatuses -
 * players in id order, so two result writes lock them alike.
 */
async function candidatesOf(
  tx: Executor,
  game: GameId,
): Promise<FillInCandidateRows[]> {
  const predictions = storedPredictions(
    await tx
      .select(predictionColumns)
      .from(matchPredictions)
      .where(eq(matchPredictions.gameId, game))
      .orderBy(asc(matchPredictions.playerId))
      .for('update'),
  );
  const candidates: FillInCandidateRows[] = [];
  for (const prediction of predictions) {
    candidates.push({
      prediction,
      statuses: await lockPlayerStatuses(tx, prediction.player),
    });
  }
  return candidates;
}

/** Writes each changed row and its player's status rows. */
async function writeMade(
  tx: Executor,
  made: readonly FillInMade[],
): Promise<void> {
  for (const { prediction, statuses } of made) {
    const playerKey = keyOf(prediction.player, 'player');
    await tx
      .update(matchPredictions)
      .set({
        home: prediction.home,
        away: prediction.away,
        origin: prediction.origin,
        filledInAt:
          prediction.filledInAt === null
            ? null
            : new Date(prediction.filledInAt),
      })
      .where(
        and(
          eq(matchPredictions.playerId, playerKey),
          eq(matchPredictions.gameId, prediction.game),
        ),
      );
    for (const row of statuses) {
      await tx
        .update(tournamentPlayers)
        .set({
          switchedOff: row.switchedOff,
          adminHidden: row.adminHidden,
          fillIns: row.fillIns,
        })
        .where(
          and(
            eq(tournamentPlayers.playerId, playerKey),
            eq(tournamentPlayers.tournamentId, Number(row.tournament)),
          ),
        );
    }
  }
}
