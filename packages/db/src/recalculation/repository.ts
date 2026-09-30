import {
  ok,
  type InputReads,
  refuse,
  type PlayerId,
  type Result,
  type Tournament,
  type TournamentInputs,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { listTournamentPlayers } from '../player/repository';
import { loadGameOdds } from '../points/repository';
import type { PointsSource } from '../points/schema';
import { loadMatchPredictions } from '../prediction/repository';
import { loadSeason } from '../season/repository';
import { loadStandingsPredictions } from '../standings/repository';
import {
  loadStoredSurvivalRows,
  loadSurvivalRuns,
} from '../survival/repository';
import { loadTeamOutcomes } from '../team/repository';

/**
 * Why a tournament's stored inputs cannot be recalculated: a prediction,
 * a standings prediction, a survival pick or a stored survival row belongs
 * to a player who is not one of the tournament's `tournament_players`.
 * Every load makes each row's owner a player (mapSportbet), so such a row
 * is an inconsistent database, refused rather than totalled.
 */
export type TournamentInputsRefusal = 'row-of-player-not-in-tournament';

/**
 * One tournament's TournamentInputs, read in one repeatable-read, read-only
 * transaction so they are one consistent snapshot. Stored odds and stored
 * survival rows (`reads`) are those of `source`, which the caller names:
 * production's, as sportbet's full recalculation reads them. Its players are the
 * tournament's `tournament_players`; a row of anyone else is refused.
 */
export async function loadTournamentInputs(
  db: Executor,
  tournament: Tournament,
  reads: InputReads,
  source: PointsSource,
): Promise<Result<TournamentInputs, TournamentInputsRefusal>> {
  return db.transaction(
    async (tx) => {
      const season = await loadSeason(tx, tournament);
      const players = await listTournamentPlayers(tx, tournament);
      const predictions = await loadMatchPredictions(tx, tournament);
      const odds =
        reads.odds === 'stored'
          ? new Map(
              (await loadGameOdds(tx, tournament, source)).map(
                ({ game, odds: stored }) => [game, stored],
              ),
            )
          : 'from-votes';
      const survival =
        reads.survival === 'stored-rows'
          ? {
              from: 'stored-rows' as const,
              rows: await loadStoredSurvivalRows(tx, tournament, source),
            }
          : {
              from: 'picks' as const,
              runs: await loadSurvivalRuns(tx, tournament),
            };
      const standings = await loadStandingsPredictions(tx, tournament);
      const outcomes = await loadTeamOutcomes(tx, tournament);
      const playing = new Set(players);
      const owners: readonly PlayerId[] = [
        ...predictions.map(({ player }) => player),
        ...standings.map(({ player }) => player),
        ...(survival.from === 'stored-rows'
          ? survival.rows.map(({ player }) => player)
          : [...survival.runs.keys()]),
      ];
      if (owners.some((owner) => !playing.has(owner))) {
        return refuse('row-of-player-not-in-tournament');
      }
      return ok({
        season,
        players,
        predictions,
        odds,
        survival,
        standings,
        outcomes,
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
