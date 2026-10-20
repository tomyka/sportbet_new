import {
  ok,
  recalculateTournament,
  refuse,
  type PlayerId,
  type Result,
  type Tournament,
  type TournamentInputs,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { listTournamentPlayers } from '../player/repository';
import { loadGameOdds, savePointsInScope } from '../points/repository';
import { loadMatchPredictions } from '../prediction/repository';
import { loadSeason } from '../season/repository';
import { loadStandingsPredictions } from '../standings/repository';
import { loadSurvivalRuns } from '../survival/repository';
import { loadTeamOutcomes } from '../team/repository';
import { TournamentScope } from '../tournament/scope';
import { lockTournamentForRecalculation, type TournamentLock } from './lock';

/**
 * Why a tournament's stored inputs cannot be recalculated: a prediction,
 * a standings prediction or a survival pick belongs
 * to a player who is not one of the tournament's `tournament_players`.
 * Every save refuses such a row (TournamentScope), so it is an inconsistent
 * database - a tournament player removed under their rows - refused rather
 * than totalled.
 */
export type TournamentInputsRefusal = 'row-of-player-not-in-tournament';

/**
 * One tournament's TournamentInputs and the TournamentScope they were checked
 * against, read in one repeatable-read, read-only transaction so they are one
 * consistent snapshot. The stored odds are the live ones (R-99). Its players
 * are the tournament's `tournament_players`; a row of anyone else is refused.
 */
async function readInputs(
  db: Executor,
  tournament: Tournament,
): Promise<{
  readonly scope: TournamentScope;
  readonly inputs: Result<TournamentInputs, TournamentInputsRefusal>;
}> {
  return db.transaction(
    async (tx) => {
      const season = await loadSeason(tx, tournament);
      const players = await listTournamentPlayers(tx, tournament);
      const predictions = await loadMatchPredictions(tx, tournament);
      const odds = new Map(
        (await loadGameOdds(tx, tournament)).map(({ game, odds: stored }) => [
          game,
          stored,
        ]),
      );
      const survival = await loadSurvivalRuns(tx, tournament);
      const standings = await loadStandingsPredictions(tx, tournament);
      const outcomes = await loadTeamOutcomes(tx, tournament);
      const scope = await TournamentScope.read(tx, tournament);
      const owners: readonly PlayerId[] = [
        ...predictions.map(({ player }) => player),
        ...standings.map(({ player }) => player),
        ...survival.keys(),
      ];
      if (owners.some((owner) => !scope.hasPlayer(owner))) {
        return { scope, inputs: refuse('row-of-player-not-in-tournament') };
      }
      return {
        scope,
        inputs: ok({
          season,
          players,
          predictions,
          odds,
          survival,
          standings,
          outcomes,
        }),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/** One tournament's TournamentInputs (readInputs): a row of a player not in it is refused. */
export async function loadTournamentInputs(
  db: Executor,
  tournament: Tournament,
): Promise<Result<TournamentInputs, TournamentInputsRefusal>> {
  return (await readInputs(db, tournament)).inputs;
}

/**
 * Recalculates one locked tournament and saves the result: its inputs (the
 * odds each scored game was scored with, else its votes, R-99),
 * recalculateTournament once, and every row saved under the live source - the
 * retired production and sportbet rows are never written. Only under the
 * tournament's recalculation lock (TournamentLock: the transaction that
 * holds it, and the tournament); its scope is read once. A refusal of the
 * inputs or of the recalculation is an inconsistent database, an impossible
 * state: it throws, naming the tournament and the reason, nothing is saved
 * and the caller's transaction rolls back.
 */
export async function recalculateAndSave(lock: TournamentLock): Promise<void> {
  const { tx, tournament } = lock;
  const { scope, inputs } = await readInputs(tx, tournament);
  const result = inputs.ok ? recalculateTournament(inputs.value) : inputs;
  if (!result.ok) {
    throw new Error(
      `tournament ${String(tournament.id)} could not be recalculated (${result.refusal}): its stored rows are inconsistent`,
    );
  }
  await savePointsInScope(tx, scope, result.value);
}

/**
 * recalculateAndSave in a transaction of its own, under the tournament's
 * recalculation lock: for a caller that writes nothing else (the db tests).
 */
export function recalculateInOwnTransaction(
  db: Executor,
  tournament: Tournament,
): Promise<void> {
  return db.transaction(async (tx) =>
    recalculateAndSave(await lockTournamentForRecalculation(tx, tournament)),
  );
}
