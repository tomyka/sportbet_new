import {
  pointsChart,
  type PlayerId,
  type PointsChart,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadChartColours } from '../player/chart-colour';
import { loadLeagueView } from './league-view';

/**
 * ChartController::getChartData over the request's tournament: the viewer's
 * league table's rows, whose histories are the lines (R-85, R-102), the
 * listed players' own colours (R-136) and the team names for the games'
 * labels; pointsChart decides everything shown. It only loads.
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
  const colours = await loadChartColours(
    db,
    table.rows.map(({ player }) => player),
  );
  return pointsChart({ season, table: table.rows, teamNames, colours });
}
