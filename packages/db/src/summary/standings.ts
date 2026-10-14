import {
  standingsSummary,
  type PlayerId,
  type RuleSet,
  type StandingsSummary,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadStandingsPredictions } from '../standings/repository';
import { listTeams, loadTeamOutcomes } from '../team/repository';
import { loadLeagueView } from './league-view';

/**
 * PredictionStandingController::getPredictionStandingSummary over the
 * request's tournament: the league table's rows for the columns' order
 * (R-102), the tournament's teams and outcomes, and the listed players'
 * standings predictions; standingsSummary decides everything shown. It only
 * loads.
 */
export async function loadStandingsSummary(
  db: Executor,
  input: {
    readonly viewer: PlayerId;
    readonly tournament: Tournament;
    readonly rules: RuleSet;
  },
): Promise<StandingsSummary> {
  const { viewer, tournament, rules } = input;
  const { table, standing, listedOnly } = await loadLeagueView(
    db,
    tournament,
    { selectedBy: viewer },
    rules,
  );
  return standingsSummary({
    table: table.rows,
    teams: await listTeams(db, tournament),
    outcomes: await loadTeamOutcomes(db, tournament),
    predictions: listedOnly(await loadStandingsPredictions(db, tournament)),
    rows: standing.rows,
  });
}
