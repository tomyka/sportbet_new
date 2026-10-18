import type { JSX } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { CompareView } from '../../../components/compare/compare-view';
import { PLAYER_HOME } from '../../../components/shell/shell-paths';
import { compareForRequest } from '../../../server/compare/compare-for-request';
import { guestSignInFor } from '../../../server/compare/compare-request';

/**
 * CompareController::show, behind sportbet's `auth`: a userID that is not
 * all digits is a 404 for everyone (the route's constraint); a guest goes to
 * sign in and comes back here, whatever the digits; digits that are no id
 * are a 404 for a player; a player in no
 * tournament goes to the front page; comparing oneself goes to the game
 * page; a player outside the tournament's listed players is a 404 (R-73).
 * The league table's modal loads the same answer as a card (./card/route.ts).
 */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ userID: string }>;
}): Promise<JSX.Element> {
  await connection();
  const { userID } = await params;
  const answer = await compareForRequest(userID);
  if (answer.kind === 'comparison') {
    return <CompareView comparison={answer.comparison} />;
  }
  if (answer.kind === 'guest') redirect(guestSignInFor(userID));
  if (answer.kind === 'no-tournament') redirect('/');
  if (answer.kind === 'self') redirect(PLAYER_HOME);
  notFound();
}
