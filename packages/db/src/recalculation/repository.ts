import {
  inputReadsOf,
  ok,
  type InputReads,
  recalculateTournament,
  type RecalculationRefusal,
  refuse,
  type PlayerId,
  type Result,
  type RuleSet,
  type Tournament,
  type TournamentInputs,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { listTournamentPlayers } from '../player/repository';
import { loadGameOdds, saveTournamentPoints } from '../points/repository';
import type { PointsSource } from '../points/schema';
import { loadMatchPredictions } from '../prediction/repository';
import { loadSeason } from '../season/repository';
import { loadStandingsPredictions } from '../standings/repository';
import {
  loadStoredSurvivalRows,
  loadSurvivalRuns,
} from '../survival/repository';
import { loadTeamOutcomes } from '../team/repository';
import { TournamentScope } from '../tournament/scope';

/**
 * Why a tournament's stored inputs cannot be recalculated: a prediction,
 * a standings prediction, a survival pick or a stored survival row belongs
 * to a player who is not one of the tournament's `tournament_players`.
 * Every save refuses such a row (TournamentScope), so it is an inconsistent
 * database - a tournament player removed under their rows - refused rather
 * than totalled.
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
      const scope = await TournamentScope.read(tx, tournament);
      const owners: readonly PlayerId[] = [
        ...predictions.map(({ player }) => player),
        ...standings.map(({ player }) => player),
        ...(survival.from === 'stored-rows'
          ? survival.rows.map(({ player }) => player)
          : [...survival.runs.keys()]),
      ];
      if (owners.some((owner) => !scope.hasPlayer(owner))) {
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

/** Why recalculateUnderRuleSet saved nothing: the inputs', or the recalculation's. */
export type RuleSetRecalculationRefusal =
  TournamentInputsRefusal | RecalculationRefusal;

/**
 * One tournament's inputs as `rules` reads them (inputReadsOf): the stored
 * odds and survival rows it reads are production's, as sportbet's full
 * recalculation reads them. The parity checker's rulings runs read these
 * and recalculate in memory, saving nothing.
 */
export function loadInputsUnderRuleSet(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<Result<TournamentInputs, TournamentInputsRefusal>> {
  return loadTournamentInputs(
    db,
    tournament,
    inputReadsOf(rules),
    'production',
  );
}

/**
 * Recalculates one tournament under `rules` and saves the result: its
 * inputs as the rule set reads them, recalculateTournament once, and every
 * row saved under the rule set's own name as its points_source - so the
 * source is named by the caller, through the rule set it passes, never
 * defaulted, and no rule set writes the production rows. Null once saved;
 * else the refusal, and nothing is saved.
 */
export async function recalculateUnderRuleSet(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<RuleSetRecalculationRefusal | null> {
  const inputs = await loadInputsUnderRuleSet(db, tournament, rules);
  const result = inputs.ok
    ? recalculateTournament(inputs.value, rules)
    : inputs;
  if (!result.ok) return result.refusal;
  await saveTournamentPoints(db, tournament, rules.name, result.value);
  return null;
}
