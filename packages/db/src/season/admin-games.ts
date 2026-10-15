import {
  gameDeletion,
  ok,
  planGameChange,
  planNewGame,
  refuse,
  roundNumber,
  type GameChangeRefusal,
  type GameDeletionRefusal,
  type GameFormEntry,
  type GameId,
  type GameScope,
  type Instant,
  type NewGameRefusal,
  type Result,
  type RoundNumber,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { databaseClock, type DatabaseClock } from '../clock';
import type { Executor } from '../client';
import { gameOf, keyOf, stored } from '../edge';
import { seedBlankRows } from '../joining/seed-blank-rows';
import { gameOdds, matchPoints } from '../points/schema';
import { matchPredictions } from '../prediction/schema';
import { lockTournamentById, type TournamentLock } from '../recalculation/lock';
import { auditResults } from '../result/schema';
import { saveTransaction } from '../save-transaction';
import { listTeams } from '../team/repository';
import { tournamentIdRows } from '../tournament/repository';
import {
  lockStructure,
  readSeason,
  recalculateStructure,
  type StructureWrite,
} from './admin';
import { realPredictionCounts } from './real-predictions';
import { saveGames } from './repository';
import { games, rounds } from './schema';

/** A game to add to `tournament`, its form already checked (gameFormEntry). */
export interface GameInsert extends StructureWrite {
  readonly entry: GameFormEntry;
}

/**
 * A change to an existing game, which names its own tournament (the
 * confirmed delete knows only the game): the form's entry, at `now`.
 */
export interface GameUpdate {
  readonly game: GameId;
  readonly entry: GameFormEntry;
  readonly rules: RuleSet;
  readonly now: Instant;
}

export interface GameDelete {
  readonly game: GameId;
  readonly rules: RuleSet;
  readonly now: Instant;
}

export type GameInsertRefusal = 'no-tournament' | NewGameRefusal;
export type GameUpdateRefusal = 'no-game' | GameChangeRefusal;
export type GameDeleteRefusal = 'no-game' | GameDeletionRefusal;

const roundRows = z.array(z.object({ id: z.int(), number: z.int() }));

/** What belongs to the tournament, for the domain's mixed-tournament check (issue 272). */
async function gameScope(
  tx: Executor,
  tournament: Tournament,
): Promise<GameScope> {
  const rows = roundRows.parse(
    await tx
      .select({ id: rounds.id, number: rounds.number })
      .from(rounds)
      .where(eq(rounds.tournamentId, tournament.id))
      .orderBy(asc(rounds.id)),
  );
  return {
    teams: (await listTeams(tx, tournament)).map(({ id }) => id),
    rounds: new Map<number, RoundNumber>(
      rows.map((row) => [
        row.id,
        stored(roundNumber(row.number), 'rounds', row.id),
      ]),
    ),
  };
}

/**
 * GameController::insertGame in one transaction under the tournament's
 * recalculation lock, waiting at most 5 s for it, into the tournament the
 * admin works on: the domain decides (planNewGame: R-110, issue 272, D16(c)),
 * the game is written and every player of the tournament gets a blank row
 * for it (seedBlankRows). No `game_odds` row is made: odds before a result
 * are computed on read (R-61), and only a recalculation derives that table.
 * An unscored game moves no point, so nothing recalculates. Returns the new
 * game's id; a refusal writes nothing.
 */
export async function insertGame(
  db: Executor,
  write: GameInsert,
  clock: DatabaseClock = databaseClock,
): Promise<Result<{ readonly game: GameId }, GameInsertRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<{ game: GameId }, GameInsertRefusal>> => {
      const lock = await lockStructure(tx, write.tournament);
      if (lock === null) return refuse('no-tournament');
      const { tournament } = lock;
      const { season, finished } = await readSeason(tx, lock, write, clock);
      const planned = planNewGame(season, write.entry, {
        scope: await gameScope(tx, tournament),
        finished,
      });
      if (!planned.ok) return planned;
      const [inserted] = await tx
        .insert(games)
        .values({
          tournamentId: tournament.id,
          roundId: planned.value.roundId,
          homeTeamId: keyOf(planned.value.home, 'team'),
          awayTeamId: keyOf(planned.value.away, 'team'),
          tipOff: new Date(planned.value.tipOff),
        })
        .returning({ id: games.id });
      if (inserted === undefined) {
        throw new Error('insertGame: the inserted game has no id');
      }
      const game = gameOf(inserted.id);
      await seedBlankRows(tx, tournament, { games: [game] });
      return ok({ game });
    },
  );
}

/** The tournament of game `id`, with the game row read unlocked or locked FOR UPDATE. */
async function tournamentOfGame(
  tx: Executor,
  id: GameId,
  lock: 'unlocked' | 'locked',
): Promise<number | undefined> {
  const query = tx
    .select({ tournament: games.tournamentId })
    .from(games)
    .where(eq(games.id, id));
  const [row] = tournamentIdRows.parse(
    lock === 'locked' ? await query.for('update') : await query,
  );
  return row?.tournament;
}

/**
 * The game's tournament, its recalculation lock taken, then the game row
 * locked FOR UPDATE (the lock order): a prediction save takes the row FOR
 * SHARE and waits at most 5 s, so what is read under it - the game, its
 * real predictions - is final until commit. Null: no such game (or one
 * that moved tournament between the reads).
 */
async function lockGameRow(
  tx: Executor,
  id: GameId,
): Promise<TournamentLock | null> {
  const owner = await tournamentOfGame(tx, id, 'unlocked');
  if (owner === undefined) return null;
  const lock = await lockTournamentById(tx, owner);
  if (lock === null) return null;
  return (await tournamentOfGame(tx, id, 'locked')) === owner ? lock : null;
}

/** The players with a real prediction on the game (realPredictionCounts), under its row lock. */
async function realPredictionsOn(tx: Executor, game: GameId): Promise<number> {
  return (await realPredictionCounts(tx, { game })).get(game) ?? 0;
}

/**
 * GameController::updateGame in one transaction: the tournament's lock,
 * then the game row FOR UPDATE, then the season and the game's real
 * predictions read under them. The domain decides (planGameChange: R-110,
 * issue 272, D16(c), R-90, R-13 - at the later of `now` and the database's
 * time); the game is written and, when it has a result (its points may
 * move with its round, date or teams), the tournament recalculated under
 * `rules`. A refusal writes nothing.
 */
export async function updateGame(
  db: Executor,
  write: GameUpdate,
  clock: DatabaseClock = databaseClock,
): Promise<Result<null, GameUpdateRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<null, GameUpdateRefusal>> => {
      const lock = await lockGameRow(tx, write.game);
      if (lock === null) return refuse('no-game');
      const { season, finished, judged } = await readSeason(
        tx,
        lock,
        write,
        clock,
      );
      const game = season.game(write.game);
      if (game === undefined) {
        throw new Error(
          `updateGame: game ${String(write.game)} is not in its season`,
        );
      }
      const planned = planGameChange(season, game, write.entry, {
        scope: await gameScope(tx, lock.tournament),
        realPredictions: await realPredictionsOn(tx, write.game),
        now: judged,
        rules: write.rules,
        finished,
      });
      if (!planned.ok) return planned;
      await saveGames(tx, lock.tournament, [planned.value.game]);
      if (game.result !== null) {
        await recalculateStructure(lock, write.rules, 'updateGame');
      }
      return ok(null);
    },
  );
}

/**
 * GameController::deleteGame in one transaction, under the same locks as
 * updateGame. The domain decides (gameDeletion: R-110, R-89's real
 * predictions, a result or its history); then the game's blank rows are
 * locked by player and removed with the game, and with the game's
 * `game_odds` and `match_points` rows - a game with no result has none
 * derived, but a migrated game keeps the blank `game_odds` row sportbet
 * made for it. No point moves, so nothing recalculates. A refusal writes
 * nothing.
 */
export async function deleteGame(
  db: Executor,
  write: GameDelete,
  clock: DatabaseClock = databaseClock,
): Promise<Result<null, GameDeleteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<null, GameDeleteRefusal>> => {
      const lock = await lockGameRow(tx, write.game);
      if (lock === null) return refuse('no-game');
      const { season, finished } = await readSeason(tx, lock, write, clock);
      const game = season.game(write.game);
      if (game === undefined) {
        throw new Error(
          `deleteGame: game ${String(write.game)} is not in its season`,
        );
      }
      const recorded = await tx
        .select({ id: auditResults.id })
        .from(auditResults)
        .where(eq(auditResults.gameId, write.game))
        .limit(1);
      const decided = gameDeletion(game, {
        realPredictions: await realPredictionsOn(tx, write.game),
        resultHistory: recorded.length > 0,
        finished,
      });
      if (!decided.ok) return decided;
      await tx
        .select({ player: matchPredictions.playerId })
        .from(matchPredictions)
        .where(eq(matchPredictions.gameId, write.game))
        .orderBy(asc(matchPredictions.playerId))
        .for('update');
      await tx
        .delete(matchPredictions)
        .where(eq(matchPredictions.gameId, write.game));
      await tx.delete(gameOdds).where(eq(gameOdds.gameId, write.game));
      await tx.delete(matchPoints).where(eq(matchPoints.gameId, write.game));
      await tx.delete(games).where(eq(games.id, write.game));
      return ok(null);
    },
  );
}
