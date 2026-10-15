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
import { lockTournamentForRecalculation, type TournamentLock } from './lock';

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
 * production's, as sportbet's full recalculation reads them, or a rule
 * set's own odds (R-99). Its players are the
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
        reads.odds === 'from-votes'
          ? 'from-votes'
          : new Map(
              (await loadGameOdds(tx, tournament, source)).map(
                ({ game, odds: stored }) => [game, stored],
              ),
            );
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
 * recalculation reads them. A set that keeps its own odds (R-99,
 * `'stored-else-votes'`) has none here and takes them from the votes, as on
 * a database with no rows of its own: the parity checker's rulings runs
 * read these and recalculate in memory, saving nothing.
 */
export function loadInputsUnderRuleSet(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<Result<TournamentInputs, TournamentInputsRefusal>> {
  const reads = inputReadsOf(rules);
  return loadTournamentInputs(
    db,
    tournament,
    reads.odds === 'stored-else-votes'
      ? { ...reads, odds: 'from-votes' }
      : reads,
    'production',
  );
}

/**
 * The inputs of a recalculation that saves: as loadInputsUnderRuleSet, but a
 * set that keeps its own odds reads the `game_odds` rows saved under its
 * own name (R-99), which the save below puts back as read.
 */
function loadInputsToSave(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<Result<TournamentInputs, TournamentInputsRefusal>> {
  const reads = inputReadsOf(rules);
  return reads.odds === 'stored-else-votes'
    ? loadTournamentInputs(db, tournament, reads, rules.name)
    : loadInputsUnderRuleSet(db, tournament, rules);
}

/**
 * Recalculates one tournament under `rules` and saves the result: its
 * inputs as the rule set reads them, recalculateTournament once, and every
 * row saved under the rule set's own name as its points_source - so the
 * source is named by the caller, through the rule set it passes, never
 * defaulted, and no rule set writes the production rows. Only under the
 * tournament's recalculation lock (TournamentLock: the transaction that
 * holds it, and the tournament). Null once saved; else the refusal, and
 * nothing is saved.
 */
export async function recalculateUnderRuleSet(
  lock: TournamentLock,
  rules: RuleSet,
): Promise<RuleSetRecalculationRefusal | null> {
  const { tx, tournament } = lock;
  const inputs = await loadInputsToSave(tx, tournament, rules);
  const result = inputs.ok
    ? recalculateTournament(inputs.value, rules)
    : inputs;
  if (!result.ok) return result.refusal;
  await saveTournamentPoints(tx, tournament, rules.name, result.value);
  return null;
}

/**
 * recalculateUnderRuleSet in a transaction of its own, under the
 * tournament's recalculation lock: for a caller that writes nothing else
 * (the reader, the db tests).
 */
export function recalculateLocked(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<RuleSetRecalculationRefusal | null> {
  return db.transaction(async (tx) =>
    recalculateUnderRuleSet(
      await lockTournamentForRecalculation(tx, tournament),
      rules,
    ),
  );
}
