import type { JSX } from 'react';
import { loadStandingsPage } from '@sportbet/db';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { StandingsView } from '../../../components/standings/standings-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';
import { signInAndReturn } from '../../../server/sign-in/guarded-pages';

/**
 * PredictionStandingController::getPredictionStandingsUser, behind
 * sportbet's `auth`: a guest goes to sign in and comes back here; a player
 * in no tournament goes to the front page, as sportbet redirects to `/`;
 * a player sees their own ladder of the request's tournament (R-28).
 */
export default async function PredictionStandingsPage(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('standings'));
  if (context.tournament === null) redirect('/');
  const page = await loadStandingsPage(getDb(), {
    player: context.player.id,
    tournament: context.tournament.tournament,
    now: now(),
  });
  return <StandingsView page={page} />;
}
