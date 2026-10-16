import type { JSX } from 'react';
import { loadDashboardLeague } from '@sportbet/db';
import { ruledRules, rulesPage } from '@sportbet/domain';
import { connection } from 'next/server';
import { RulesView } from '../../components/rules/rules-view';
import { getDb } from '../../server/db';
import { signedInPlayer } from '../../server/request-context';
import { describedTournament } from '../../server/visitor-tournament';

/**
 * RulesController::index: public. Every figure is `rulesPage`'s under
 * `ruledRules` (R-100), for the tournament the visitor is in or would join
 * (describedTournament); with none, the page still answers, without the
 * table length and the deadline round. A signed-in player in a tournament
 * also gets their league's fee panel (R-104, R-124), a guest none.
 */
export default async function RulesRoute(): Promise<JSX.Element> {
  await connection();
  const signedIn = await signedInPlayer();
  const described = await describedTournament();
  const page = rulesPage(
    ruledRules,
    described === null
      ? { teamCount: null, deadlineRound: null, standingsCloses: null }
      : described.facts,
  );
  const panel =
    signedIn === null || described === null
      ? null
      : (
          await loadDashboardLeague(getDb(), {
            player: signedIn.player,
            tournament: described.tournament,
            rules: ruledRules,
          })
        ).panel;
  return <RulesView page={page} player={signedIn !== null} panel={panel} />;
}
