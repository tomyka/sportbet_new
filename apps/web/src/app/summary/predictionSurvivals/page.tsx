import type { JSX } from 'react';
import { loadSurvivalSummary } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SurvivalSummaryView } from '../../../components/survival/survival-summary-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';
import { signInAndReturn } from '../../../server/sign-in/guarded-pages';

/**
 * PredictionSurvivalController's summary, behind sportbet's `auth`: a
 * guest goes to sign in and comes back here; a player in no tournament
 * goes to the front page, and so does one whose tournament plays no
 * survival (the navigation hides the entry there); a
 * player sees the request's tournament's listed
 * players (R-73), under the ruled rules.
 */
export default async function SurvivalSummaryPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('survivalSummary'));
  if (context.tournament === null) redirect('/');
  if (!context.tournament.nav.survivalSummary) redirect('/');
  const data = await loadSurvivalSummary(getDb(), {
    viewer: context.player.id,
    tournament: context.tournament.tournament,
    rules: ruledRules,
    now: now(),
  });
  return <SurvivalSummaryView data={data} />;
}
