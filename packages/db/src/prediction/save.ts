import {
  CrowdOdds,
  predictMatch,
  statusAfterSave,
  tournamentId,
  type GameId,
  type Instant,
  type PlayerId,
  type PredictedPair,
  type PredictRefusal,
  type Rate,
  type Result,
  type RuleSet,
  ok,
} from '@sportbet/domain';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { instantOf, keyOf, stored } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { findTournamentById } from '../tournament/repository';
import { predictionColumns, storedPredictions, votesOf } from './repository';
import { auditPredictionGames, matchPredictions } from './schema';

/** One save, as the form has passed it (predictionFormEntry). */
export interface PredictionSave {
  readonly player: PlayerId;
  /** The posted gameID: it must name the row's game (issue 254). */
  readonly game: GameId;
  /** The posted prediction_gameID: which of the player's rows (their row of this game). */
  readonly rowGame: GameId;
  readonly entry: PredictedPair;
  readonly now: Instant;
  readonly rules: RuleSet;
}

/** What the save answers with: the game's odds from its votes now, and its round's rate. */
export interface PredictionSaved {
  readonly odds: CrowdOdds;
  readonly rate: Rate;
}

const targetTournaments = z.array(z.object({ tournament: z.int() }));

/** The moment a save is judged at, read inside its transaction. */
export type DatabaseClock = (tx: Executor) => Promise<Instant>;

const clockRows = z.array(z.object({ seconds: z.int() }));

/**
 * The database's own clock, rounded up to the second (Instant is to the
 * second): at worst a save is judged up to a second late, never early.
 */
export const databaseClock: DatabaseClock = async (tx) => {
  const [row] = clockRows.parse(
    (
      await tx.execute(
        sql`select ceil(extract(epoch from clock_timestamp()))::double precision as seconds`,
      )
    ).rows,
  );
  if (row === undefined) {
    throw new Error('savePrediction: the database gave no time');
  }
  return instantOf(new Date(row.seconds * 1000), 'clock', 'now');
};

/**
 * PredictionResultController::updatePredictionResultUser in one
 * transaction (a savepoint when `db` is one). The player's row of the
 * posted prediction_gameID (`rowGame`) is locked for the rest of it; with
 * none, the save is "not yours". The domain decides (predictMatch) from
 * the row, its game as stored and the posted gameID, which must name that
 * game (issue 254), at the later of `now` and the database's time once the row lock
 * is held (`clock`): a save that waited for the lock across the tip-off is
 * closed (LR-1). Then the row is written as a real prediction, the
 * player's status where the save switches them back on (statusAfterSave),
 * and an audit row for a saved score. The answer's odds are the game's
 * votes now (CrowdOdds.forGame): nothing is stored for them (odds on read;
 * game_odds holds what a scored game was scored with).
 *
 * Lock order (lockTournamentForRecalculation's; a save recalculates
 * nothing, so takes no tournament lock): the game row (FOR SHARE), the
 * player's match_predictions row, then their tournament_players rows
 * through lockPlayerStatuses (by tournament id). Any lock waited for past
 * 5 s fails the save (lock_timeout).
 */
export async function savePrediction(
  db: Executor,
  save: PredictionSave,
  clock: DatabaseClock = databaseClock,
): Promise<Result<PredictionSaved, PredictRefusal>> {
  const { player, game: postedGame, rowGame, entry, now, rules } = save;
  const playerKey = keyOf(player, 'player');
  return db.transaction(
    async (tx): Promise<Result<PredictionSaved, PredictRefusal>> => {
      // A wait for any lock past 5 s fails this save cleanly (55P03,
      // lock_not_available) rather than holding the request open.
      await tx.execute(sql`set local lock_timeout = '5s'`);
      // #20's F1: the game row first, shared - a result write holds it FOR
      // NO KEY UPDATE, so a save that meets one waits, then finds the game
      // closed.
      await tx
        .select({ id: games.id })
        .from(games)
        .where(eq(games.id, rowGame))
        .for('share');
      const selected = await tx
        .select({ tournament: games.tournamentId, ...predictionColumns })
        .from(matchPredictions)
        .innerJoin(games, eq(games.id, matchPredictions.gameId))
        .where(
          and(
            eq(matchPredictions.playerId, playerKey),
            eq(matchPredictions.gameId, rowGame),
          ),
        )
        .for('update', { of: matchPredictions });
      const [row] = targetTournaments.parse(selected);
      const [prediction] = storedPredictions(selected);
      if (row === undefined || prediction === undefined) {
        const refused = predictMatch({
          target: null,
          postedGame,
          entry,
          now,
          rules,
        });
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
      const scheduled = season.game(rowGame);
      const round =
        scheduled === undefined ? undefined : season.round(scheduled.round);
      if (scheduled === undefined || round === undefined) {
        throw new Error(
          `savePrediction: game ${String(rowGame)} is not in its season`,
        );
      }
      // Judged once the row lock is held, never earlier than the call.
      const lockedAt = await clock(tx);
      const judgedAt = lockedAt > now ? lockedAt : now;
      const decided = predictMatch({
        target: { prediction, game: scheduled },
        postedGame,
        entry,
        now: judgedAt,
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
            eq(matchPredictions.gameId, rowGame),
          ),
        );
      if (written.switchesBackOn) {
        await switchBackOn(tx, player, tournament.id, rules);
      }
      if (written.audit !== null) {
        await tx.insert(auditPredictionGames).values({
          playerId: playerKey,
          gameId: rowGame,
          home: written.audit.new.home,
          away: written.audit.new.away,
          oldHome: written.audit.old.home,
          oldAway: written.audit.old.away,
          at: new Date(judgedAt),
        });
      }
      const votes = (await votesOf(tx, [rowGame])).get(rowGame) ?? [];
      return ok({ odds: CrowdOdds.forGame(votes, rules), rate: round.rate });
    },
  );
}

/**
 * Writes the player's tournament rows statusAfterSave changes, and only
 * those. The rows are locked before they are read (lockPlayerStatuses,
 * after the match_predictions row): an admin hide or a count another
 * transaction commits meanwhile is read, then kept.
 */
async function switchBackOn(
  tx: Executor,
  player: PlayerId,
  tournament: number,
  rules: RuleSet,
): Promise<void> {
  const playerKey = keyOf(player, 'player');
  const before = await lockPlayerStatuses(tx, player);
  const after = statusAfterSave(
    before,
    stored(tournamentId(String(tournament)), 'tournaments', tournament),
    rules,
  );
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
