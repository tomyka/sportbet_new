import type { JSX } from 'react';
import { loadSurvivalPickPage } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SurvivalView } from '../../../components/survival/survival-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';
import { signInAndReturn } from '../../../server/sign-in/guarded-pages';

/**
 * PredictionSurvivalController's page, behind sportbet's `auth`: a guest
 * goes to sign in and comes back here; a player in no tournament goes to
 * the front page, as sportbet redirects to `/`; a player sees their own
 * survival in the request's tournament (R-28), under the ruled rules.
 */
export default async function PredictionSurvivalPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('survival'));
  if (context.tournament === null) redirect('/');
  const data = await loadSurvivalPickPage(getDb(), {
    player: context.player.id,
    tournament: context.tournament.tournament,
    rules: ruledRules,
    now: now(),
  });
  return <SurvivalView data={data} />;
}
