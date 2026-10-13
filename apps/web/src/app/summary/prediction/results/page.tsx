import type { JSX } from 'react';
import { loadResultsSummary } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ResultsSummaryView } from '../../../../components/summary/results-summary-view';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { requestContext } from '../../../../server/request-context';
import { signInAndReturn } from '../../../../server/sign-in/guarded-pages';

/**
 * PredictionResultController::getPredictionResultSummary, behind sportbet's
 * `auth`: a guest goes to sign in and comes back here; a player in no
 * tournament goes to the front page; a player sees everyone's predictions on
 * the request's tournament's games that are no longer open (R-86), under the
 * ruled rules.
 */
export default async function ResultsSummaryPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('resultsSummary'));
  if (context.tournament === null) redirect('/');
  const data = await loadResultsSummary(getDb(), {
    tournament: context.tournament.tournament,
    now: now(),
    rules: ruledRules,
  });
  return <ResultsSummaryView data={data} viewer={context.player.id} />;
}
