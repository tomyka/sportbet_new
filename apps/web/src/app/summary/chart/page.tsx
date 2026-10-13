import type { JSX } from 'react';
import { loadPointsChart } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PointsChartView } from '../../../components/summary/points-chart-view';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';
import { signInAndReturn } from '../../../server/sign-in/guarded-pages';

/**
 * ChartController::getChartData, behind sportbet's `auth`: a guest goes to
 * sign in and comes back here; a player in no tournament goes to the front
 * page; a player sees every listed player's points through the request's
 * tournament's scored games, under the ruled rules (R-85).
 */
export default async function ChartPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('chart'));
  if (context.tournament === null) redirect('/');
  const chart = await loadPointsChart(getDb(), {
    tournament: context.tournament.tournament,
    rules: ruledRules,
  });
  return <PointsChartView chart={chart} />;
}
