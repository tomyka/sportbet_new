import {
  enterResult,
  mistakenFillInsRemoved,
  resultFillIns,
  resultFormEntry,
  tournamentId,
  type FillInCandidateRows,
  type FillInDice,
  type FillInMade,
  type Game,
  type GameId,
  type Instant,
  type MatchPrediction,
  type PlayerId,
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
import { auditResults } from './schema';
import { databaseClock, type DatabaseClock } from '../prediction/save';
import { lockTournamentForRecalculation } from '../recalculation/lock';
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
  /** Who saves it: the session's player, recorded in audit_results (R-69). */
  readonly by: PlayerId;
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
 * first (resultFormEntry, no database read); then the tournament's
 * recalculation lock (lockTournamentForRecalculation: one recalculating
 * writer per tournament at a time); then the game row, locked FOR NO KEY
 * UPDATE for the rest of the transaction (#20's F1: a prediction save takes
 * it FOR SHARE and waits, then finds the game closed; the recalculation's
 * foreign-key checks, KEY SHARE, never wait on it); judged at the later of
 * `now` and the database's time once the lock is held. A finished
 * tournament is refused (R-22, decision 7). Then:
 * - the game's new state (enterResult) written;
 * - on a correction, FI-4's mistaken fill-ins removed (R-5);
 * - on a score, the blank rows filled in (FI-1, R-32, R-39) and counted
 *   (R-7);
 * - in both, only the players whose rows may change have their status
 *   rows locked (lockPlayerStatuses), players in id order;
 * - the tournament recalculated under `rules` (recalculateUnderRuleSet),
 *   whose refusal is an inconsistent database: it throws, all rolled back.
 *
 * Lock order (lockTournamentForRecalculation's): the tournament lock, the
 * game row, the game's match_predictions rows (FOR UPDATE, by player),
 * each changing player's tournament_players rows.
 */
export async function saveResult(
  db: Executor,
  save: ResultSave,
  clock: DatabaseClock = databaseClock,
): Promise<ResultSaveOutcome> {
  const { game: id, boxes, now, rules, dice, by } = save;
  const form = resultFormEntry(boxes);
  if (!form.ok) return refused({ kind: 'fields', errors: form.errors });
  return db.transaction(async (tx): Promise<ResultSaveOutcome> => {
    const tournamentOf = async (lock: 'unlocked' | 'locked') => {
      const query = tx
        .select({ tournament: games.tournamentId })
        .from(games)
        .where(eq(games.id, id));
      const [row] = gameRows.parse(
        lock === 'locked' ? await query.for('no key update') : await query,
      );
      return row?.tournament;
    };
    const owner = await tournamentOf('unlocked');
    if (owner === undefined) return refused({ kind: 'no-game' });
    await lockTournamentForRecalculation(tx, owner);
    const lockedOwner = await tournamentOf('locked');
    if (lockedOwner === undefined) return refused({ kind: 'no-game' });
    if (lockedOwner !== owner) {
      throw new Error(
        `saveResult: game ${String(id)} moved tournament mid-save`,
      );
    }
    const tournament = await findTournamentById(tx, owner);
    if (tournament === undefined) {
      throw new Error(`saveResult: tournament ${String(owner)} is not stored`);
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
    await recordChange(tx, {
      by,
      before: game,
      after: entered.value.game,
      at: judgedAt,
    });
    const key = stored(
      tournamentId(String(tournament.id)),
      'tournaments',
      tournament.id,
    );
    if (entered.value.corrected) {
      await writeMade(
        tx,
        mistakenFillInsRemoved({
          game: entered.value.game,
          tournament: key,
          // Only a fill-in can be one a mistaken result made (FI-4).
          candidates: await candidatesOf(
            tx,
            id,
            (prediction) => prediction.origin === 'fill-in',
          ),
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
          // Only a blank row is filled in (FI-1).
          candidates: await candidatesOf(tx, id, (prediction) =>
            prediction.hasBlankHomeScore(),
          ),
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
 * The game's prediction rows, locked FOR UPDATE by player; those `mayChange`
 * keeps, each with the player's tournament_players rows locked through
 * lockPlayerStatuses - only the players whose rows may change, in id
 * order, so two result writes lock them alike.
 */
async function candidatesOf(
  tx: Executor,
  game: GameId,
  mayChange: (prediction: MatchPrediction) => boolean,
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
  for (const prediction of predictions.filter(mayChange)) {
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

/** A game's state as audit_results keeps it: its scores, or none, and whether it is postponed. */
function stateOf(game: Game) {
  return {
    home: game.result?.home ?? null,
    away: game.result?.away ?? null,
    postponed: game.postponed,
  };
}

/**
 * R-69: an accepted change recorded - who, which game, before and after,
 * when (no IP, R-45). A save that leaves the game as it was (the same
 * result again) changes nothing and is not recorded.
 */
async function recordChange(
  tx: Executor,
  change: {
    readonly by: PlayerId;
    readonly before: Game;
    readonly after: Game;
    readonly at: Instant;
  },
): Promise<void> {
  const old = stateOf(change.before);
  const now = stateOf(change.after);
  if (
    old.home === now.home &&
    old.away === now.away &&
    old.postponed === now.postponed
  ) {
    return;
  }
  await tx.insert(auditResults).values({
    playerId: keyOf(change.by, 'player'),
    gameId: change.after.id,
    oldHome: old.home,
    oldAway: old.away,
    oldPostponed: old.postponed,
    newHome: now.home,
    newAway: now.away,
    newPostponed: now.postponed,
    at: new Date(change.at),
  });
}
