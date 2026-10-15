import type { JSX } from 'react';
import { loadDashboard, loadDashboardLeague } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { DashboardView } from '../../components/dashboard/dashboard-view';
import { now } from '../../server/clock';
import { getDb } from '../../server/db';
import { readFlash } from '../../server/flash';
import { requestContext } from '../../server/request-context';

/**
 * MainController::loadApp, the player's home (PLAYER_HOME): the game page
 * of the request's tournament (R-28, R-46). A guest, or a player in no
 * tournament, goes to the hub (MC:29-31, 88), not to sign in. The selected
 * league adds its fee panel and messages (loadDashboardLeague).
 */
export default async function MainPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null || context.tournament === null) redirect('/');
  const db = getDb();
  const player = context.player.id;
  const tournament = context.tournament.tournament;
  const dashboard = await loadDashboard(db, {
    player,
    tournament,
    now: now(),
    rules: ruledRules,
  });
  const league = await loadDashboardLeague(db, {
    player,
    tournament,
    rules: ruledRules,
  });
  return (
    <DashboardView
      dashboard={dashboard}
      league={league}
      flash={await readFlash()}
    />
  );
}
