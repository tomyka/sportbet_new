import type { JSX } from 'react';
import { loadStandingsSummary } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { StandingsSummaryView } from '../../../../components/summary/standings-summary-view';
import { getDb } from '../../../../server/db';
import { requestContext } from '../../../../server/request-context';
import { signInAndReturn } from '../../../../server/sign-in/guarded-pages';

/**
 * PredictionStandingController::getPredictionStandingSummary, behind
 * sportbet's `auth`: a guest goes to sign in and comes back here; a player
 * in no tournament goes to the front page; a player sees every listed
 * player's standings for the request's tournament, under the ruled rules -
 * while standings are still open too, on purpose (CONTEXT.md, standings
 * deadline).
 */
export default async function StandingsSummaryPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('standingsSummary'));
  if (context.tournament === null) redirect('/');
  const data = await loadStandingsSummary(getDb(), {
    viewer: context.player.id,
    tournament: context.tournament.tournament,
    rules: ruledRules,
  });
  return <StandingsSummaryView data={data} />;
}
