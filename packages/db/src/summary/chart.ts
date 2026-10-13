import {
  pointsChart,
  type PointsChart,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { readLeagueTable } from '../dashboard/league-table';
import { loadTeamNames } from '../team/repository';

/**
 * ChartController::getChartData over the request's tournament: the league
 * table's rows, whose histories are the lines (R-85, R-102), and the team
 * names for the games' labels; pointsChart decides everything shown. It
 * only loads.
 */
export async function loadPointsChart(
  db: Executor,
  input: { readonly tournament: Tournament; readonly rules: RuleSet },
): Promise<PointsChart> {
  const { tournament, rules } = input;
  const { table, season } = await readLeagueTable(db, tournament, rules);
  return pointsChart({
    season,
    table: table.rows,
    teamNames: await loadTeamNames(db, tournament),
  });
}
