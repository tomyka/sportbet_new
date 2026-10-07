import { loadDashboard } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { DashboardView } from '../../components/dashboard/dashboard-view';
import { vilniusDate } from '../../components/format/vilnius-time';
import { now } from '../../server/clock';
import { getDb } from '../../server/db';
import { readFlash } from '../../server/flash';
import { requestContext } from '../../server/request-context';

/**
 * MainController::loadApp, the player's home (PLAYER_HOME): the game page
 * of the request's tournament (R-28, R-46). A guest, or a player in no
 * tournament, goes to the hub (MC:29-31, 88), not to sign in.
 */
export default async function MainPage() {
  await connection();
  const context = await requestContext();
  if (context.player === null || context.tournament === null) redirect('/');
  const dashboard = await loadDashboard(getDb(), {
    player: context.player.id,
    tournament: context.tournament.tournament,
    now: now(),
    rules: ruledRules,
    vilniusDay: vilniusDate,
  });
  return <DashboardView dashboard={dashboard} flash={await readFlash()} />;
}
