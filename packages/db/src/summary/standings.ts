import {
  standingsSummary,
  type RuleSet,
  type StandingsSummary,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { readLeagueTable } from '../dashboard/league-table';
import { loadStandingsPredictions } from '../standings/repository';
import { listTeams, loadTeamOutcomes } from '../team/repository';

/**
 * PredictionStandingController::getPredictionStandingSummary over the
 * request's tournament: the league table's rows for the columns' order
 * (R-102), the tournament's teams and outcomes, and the listed players'
 * standings predictions; standingsSummary decides everything shown. It only
 * loads.
 */
export async function loadStandingsSummary(
  db: Executor,
  input: { readonly tournament: Tournament; readonly rules: RuleSet },
): Promise<StandingsSummary> {
  const { tournament, rules } = input;
  const { table, standing } = await readLeagueTable(db, tournament, rules);
  return standingsSummary({
    table: table.rows,
    teams: await listTeams(db, tournament),
    outcomes: await loadTeamOutcomes(db, tournament),
    predictions: (await loadStandingsPredictions(db, tournament)).filter(
      ({ player }) => standing.listed.has(player),
    ),
    rows: standing.rows,
  });
}
