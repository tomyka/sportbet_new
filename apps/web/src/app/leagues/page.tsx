import type { JSX } from 'react';
import { loadLeaguesPage } from '@sportbet/db';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { LeaguesView } from '../../components/leagues/leagues-page';
import { getDb } from '../../server/db';
import { readFlash } from '../../server/flash';
import { requestContext } from '../../server/request-context';
import { signInAndReturn } from '../../server/sign-in/guarded-pages';

/**
 * LeagueController::index, behind sportbet's `auth`: a guest goes to sign
 * in and comes back here; a player sees their leagues in the request's
 * tournament (none when they have none) and every invite waiting for them.
 */
export default async function LeaguesRoute(): Promise<JSX.Element> {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('leagues'));
  const page = await loadLeaguesPage(getDb(), {
    player: context.player.id,
    tournament: context.tournament?.tournament ?? null,
  });
  return (
    <LeaguesView
      page={page}
      viewer={context.player.id}
      flash={await readFlash()}
    />
  );
}
