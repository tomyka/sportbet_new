import type { JSX } from 'react';
import { loadCompare } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import {
  isRouteUserId,
  otherPlayerOf,
} from '../../../components/compare/compare-address';
import { CompareView } from '../../../components/compare/compare-view';
import {
  comparisonOrLeave,
  guestSignInFor,
} from '../../../server/compare/compare-request';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';

/**
 * CompareController::show, behind sportbet's `auth`: a userID that is not
 * all digits is a 404 for everyone (the route's constraint); a guest goes to
 * sign in and comes back here, whatever the digits; digits that are no id
 * are a 404 for a player; a player in no
 * tournament goes to the front page; comparing oneself goes to the game
 * page; a player outside the tournament's listed players is a 404 (R-73).
 */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ userID: string }>;
}): Promise<JSX.Element> {
  await connection();
  const { userID } = await params;
  if (!isRouteUserId(userID)) notFound();
  const context = await requestContext();
  if (context.player === null) redirect(guestSignInFor(userID));
  const other = otherPlayerOf(userID);
  if (!other.ok) notFound();
  if (context.tournament === null) redirect('/');
  const comparison = comparisonOrLeave(
    await loadCompare(getDb(), {
      viewer: context.player.id,
      other: other.value,
      tournament: context.tournament.tournament,
      rules: ruledRules,
    }),
  );
  return <CompareView comparison={comparison} />;
}
