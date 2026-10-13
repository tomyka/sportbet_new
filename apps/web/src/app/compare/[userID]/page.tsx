import type { JSX } from 'react';
import { loadCompare } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { CompareView } from '../../../components/compare/compare-view';
import {
  comparisonOrLeave,
  otherPlayerOf,
} from '../../../server/compare/compare-request';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';
import { signInAndReturn } from '../../../server/sign-in/guarded-pages';

/**
 * CompareController::show, behind sportbet's `auth`: an id that is no id is
 * a 404; a guest goes to sign in and comes back here; a player in no
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
  const other = otherPlayerOf(userID);
  if (!other.ok) notFound();
  const context = await requestContext();
  if (context.player === null)
    redirect(signInAndReturn('compare', Number(other.value)));
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
