import {
  pointsChart,
  type PlayerId,
  type PointsChart,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadLeagueView } from './league-view';

/**
 * ChartController::getChartData over the request's tournament: the viewer's
 * league table's rows, whose histories are the lines (R-85, R-102), and the team
 * names for the games' labels; pointsChart decides everything shown. It
 * only loads.
 */
export async function loadPointsChart(
  db: Executor,
  input: {
    readonly viewer: PlayerId;
    readonly tournament: Tournament;
    readonly rules: RuleSet;
  },
): Promise<PointsChart> {
  const { viewer, tournament, rules } = input;
  const { table, season, teamNames } = await loadLeagueView(
    db,
    tournament,
    { selectedBy: viewer },
    rules,
  );
  return pointsChart({ season, table: table.rows, teamNames });
}
