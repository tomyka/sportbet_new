import {
  CrowdOdds,
  predictMatch,
  statusAfterSave,
  tournamentId,
  type Game,
  type GameId,
  type Instant,
  type MatchPrediction,
  type PlayerId,
  type PredictedPair,
  type PredictionWritten,
  type PredictRefusal,
  type Rate,
  type Result,
  type Round,
  type RuleSet,
  type Tournament,
  ok,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import type { Executor } from '../client';
import { keyOf, stored } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { saveTransaction } from '../save-transaction';
import { findTournamentById, tournamentIdRows } from '../tournament/repository';
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
  /**
   * The save switched the player back on somewhere (PL-1, R-7, R-57): a
   * tournament_players row's switched_off or admin_hidden changed, so who
   * the tables list may have. A count reset alone is not one.
   */
  readonly listingChanged: boolean;
}

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
  return saveTransaction(
    db,
    async (tx): Promise<Result<PredictionSaved, PredictRefusal>> => {
      const locked = await lockPredictionRow(tx, player, rowGame);
      if (locked === null) {
        return refusedWithoutRow({ postedGame, entry, now, rules });
      }
      const { tournament, game, round } = await gameInItsSeason(
        tx,
        locked.tournament,
        rowGame,
      );
      // Judged once the row lock is held, never earlier than the call.
      const judged = await judgedAt(tx, clock, now);
      const decided = predictMatch({
        target: { prediction: locked.prediction, game },
        postedGame,
        entry,
        now: judged,
        rules,
      });
      if (!decided.ok) return decided;
      const listingChanged = await writePrediction(tx, {
        player,
        tournament,
        written: decided.value,
        judged,
        rules,
      });
      const votes = (await votesOf(tx, [rowGame])).get(rowGame) ?? [];
      return ok({
        odds: CrowdOdds.forGame(votes, rules),
        rate: round.rate,
        listingChanged,
      });
    },
  );
}

/**
 * The player's row of `rowGame`, locked: the game row first, shared (#20's
 * F1: a result write holds it FOR NO KEY UPDATE, so a save that meets one
 * waits, then finds the game closed), then the row FOR UPDATE. Null: the
 * player has no row of that game.
 */
async function lockPredictionRow(
  tx: Executor,
  player: PlayerId,
  rowGame: GameId,
): Promise<{ tournament: number; prediction: MatchPrediction } | null> {
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
        eq(matchPredictions.playerId, keyOf(player, 'player')),
        eq(matchPredictions.gameId, rowGame),
      ),
    )
    .for('update', { of: matchPredictions });
  const [row] = tournamentIdRows.parse(selected);
  const [prediction] = storedPredictions(selected);
  return row === undefined || prediction === undefined
    ? null
    : { tournament: row.tournament, prediction };
}

/** The domain's refusal of a save with no row of the player's ("not yours"). */
function refusedWithoutRow(
  save: Pick<PredictionSave, 'entry' | 'now' | 'rules'> & {
    readonly postedGame: GameId;
  },
): Result<PredictionSaved, PredictRefusal> {
  const refused = predictMatch({ ...save, target: null });
  if (refused.ok) {
    throw new Error('savePrediction: a save with no row was accepted');
  }
  return refused;
}

/** The row's game as stored, in its tournament's season, with its round. */
async function gameInItsSeason(
  tx: Executor,
  tournamentId: number,
  rowGame: GameId,
): Promise<{ tournament: Tournament; game: Game; round: Round }> {
  const tournament = await findTournamentById(tx, tournamentId);
  if (tournament === undefined) {
    throw new Error(
      `savePrediction: tournament ${String(tournamentId)} is not stored`,
    );
  }
  const season = await loadSeason(tx, tournament);
  const game = season.game(rowGame);
  const round = game === undefined ? undefined : season.round(game.round);
  if (game === undefined || round === undefined) {
    throw new Error(
      `savePrediction: game ${String(rowGame)} is not in its season`,
    );
  }
  return { tournament, game, round };
}

/**
 * The decided save written: the row as a real prediction, the player's
 * status where the save switches them back on (switchBackOn), and an
 * audit row for a saved score. True when who the tables list may have
 * changed (PredictionSaved.listingChanged).
 */
async function writePrediction(
  tx: Executor,
  write: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    readonly written: PredictionWritten;
    readonly judged: Instant;
    readonly rules: RuleSet;
  },
): Promise<boolean> {
  const { player, tournament, written, judged, rules } = write;
  const playerKey = keyOf(player, 'player');
  const rowGame = written.prediction.game;
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
  const listingChanged = written.switchesBackOn
    ? await switchBackOn(tx, player, tournament.id, rules)
    : false;
  if (written.audit !== null) {
    await tx.insert(auditPredictionGames).values({
      playerId: playerKey,
      gameId: rowGame,
      home: written.audit.new.home,
      away: written.audit.new.away,
      oldHome: written.audit.old.home,
      oldAway: written.audit.old.away,
      at: new Date(judged),
    });
  }
  return listingChanged;
}

/**
 * Writes the player's tournament rows statusAfterSave changes, and only
 * those. The rows are locked before they are read (lockPlayerStatuses,
 * after the match_predictions row): an admin hide or a count another
 * transaction commits meanwhile is read, then kept. True when a row's
 * switched_off or admin_hidden changed (PredictionSaved.listingChanged).
 */
async function switchBackOn(
  tx: Executor,
  player: PlayerId,
  tournament: number,
  rules: RuleSet,
): Promise<boolean> {
  const playerKey = keyOf(player, 'player');
  const before = await lockPlayerStatuses(tx, player);
  let listingChanged = false;
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
    listingChanged ||=
      was.switchedOff !== next.switchedOff ||
      was.adminHidden !== next.adminHidden;
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
  return listingChanged;
}
