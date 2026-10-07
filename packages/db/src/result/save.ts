import {
  enterResult,
  mistakenFillInsRemoved,
  ok,
  refuse,
  resultFillIns,
  tournamentId,
  type EnterResultRefusal,
  type FillInCandidateRows,
  type FillInDice,
  type FillInMade,
  type Game,
  type GameId,
  type Instant,
  type MatchPrediction,
  type PlayerId,
  type Result,
  type ResultEntry,
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

/** One result, its boxes already checked (resultFormEntry). */
export interface ResultSave {
  readonly game: GameId;
  /** A score, the postponed placeholder (R-63), or a clear. */
  readonly entry: ResultEntry;
  readonly now: Instant;
  readonly rules: RuleSet;
  readonly dice: FillInDice;
  /** Who saves it: the session's player, recorded in audit_results (R-69). */
  readonly by: PlayerId;
}

/** Why a checked result was not saved: the game's own refusals, no game, or a finished tournament. */
export type ResultSaveRefusal = EnterResultRefusal | 'no-game' | 'frozen';

const gameRows = z.array(z.object({ tournament: z.int() }));

/**
 * ResultController::updateResult in one transaction, for an entry whose
 * boxes the caller has checked (resultFormEntry: the field errors are the
 * caller's to answer, as savePrediction's are). First the tournament's
 * recalculation lock (lockTournamentForRecalculation: one recalculating
 * writer per tournament at a time); then the game row, locked FOR NO KEY
 * UPDATE for the rest of the transaction (#20's F1: a prediction save takes
 * it FOR SHARE and waits, then finds the game closed; the recalculation's
 * foreign-key checks, KEY SHARE, never wait on it); judged at the later of
 * `now` and the database's time once the lock is held. A finished
 * tournament is refused (R-22, decision 7). Then:
 * - the game's new state (enterResult) written, and the change recorded
 *   (R-69);
 * - the rows either step below may change locked once, players in id
 *   order: a correction's fill-ins, a score's blank rows;
 * - on a correction, FI-4's mistaken fill-ins removed (R-5);
 * - on a score, the blank rows filled in (FI-1, R-32, R-39) and counted
 *   (R-7);
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
): Promise<Result<null, ResultSaveRefusal>> {
  const { game: id, entry, now, rules, dice, by } = save;
  return db.transaction(
    async (tx): Promise<Result<null, ResultSaveRefusal>> => {
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
      if (owner === undefined) return refuse('no-game');
      const tournament = await findTournamentById(tx, owner);
      if (tournament === undefined) {
        throw new Error(
          `saveResult: tournament ${String(owner)} is not stored`,
        );
      }
      const lock = await lockTournamentForRecalculation(tx, tournament);
      const lockedOwner = await tournamentOf('locked');
      if (lockedOwner === undefined) return refuse('no-game');
      if (lockedOwner !== owner) {
        throw new Error(
          `saveResult: game ${String(id)} moved tournament mid-save`,
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
        return refuse('frozen');
      }
      const entered = enterResult({
        game,
        entry,
        now: judgedAt,
        rules,
      });
      if (!entered.ok) return refuse(entered.refusal);
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
      const { corrected, scored } = entered.value;
      // Every row either step may change, locked once (finding 1): a
      // correction's fill-ins (FI-4) and a score's blank rows (FI-1).
      let candidates = await candidatesOf(
        tx,
        id,
        (prediction) =>
          (corrected && prediction.origin === 'fill-in') ||
          (scored && prediction.hasBlankHomeScore()),
      );
      if (corrected) {
        const removed = mistakenFillInsRemoved({
          game: entered.value.game,
          tournament: key,
          candidates,
          rules,
        });
        await writeMade(tx, removed);
        // A removed fill-in is a blank row now, to be filled in below.
        candidates = candidates.map(
          (each) =>
            removed.find(
              ({ prediction }) => prediction.player === each.prediction.player,
            ) ?? each,
        );
      }
      if (scored) {
        await writeMade(
          tx,
          resultFillIns({
            game: entered.value.game,
            tournament: key,
            candidates,
            dice,
            madeAt: judgedAt,
            rules,
          }),
        );
      }
      const refusal = await recalculateUnderRuleSet(lock, rules);
      if (refusal !== null) {
        throw new Error(
          `saveResult: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
        );
      }
      return ok(null);
    },
  );
}

/**
 * The game's prediction rows, locked FOR UPDATE by player; those `mayChange`
 * keeps, each with the player's tournament_players rows locked through
 * lockPlayerStatuses - only the players whose rows may change, once per
 * write and in player id order, so two result writes (even in different
 * tournaments, which share no tournament lock) never lock them crosswise.
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
