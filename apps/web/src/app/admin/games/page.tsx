import type { JSX } from 'react';
import { loadAdminGames, type AdminGamesPage } from '@sportbet/db/admin';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { GamesView } from '../../../components/admin/games-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

/** No games, teams or rounds: what the page shows while no tournament is chosen. */
const NOTHING: AdminGamesPage = {
  games: [],
  teams: [],
  rounds: [],
  latestTipOff: null,
  lastRoundId: null,
  finished: false,
};

/**
 * GameController::getGameAll, behind the superadmin tier (R-26 amended):
 * the games of the tournament the admin works on, newest first, each with
 * whether it may be deleted now (R-89), judged under the live rule set.
 */
export default async function AdminGamesPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const tournament = await workingTournament(admin.player);
  const page =
    tournament === null
      ? NOTHING
      : await loadAdminGames(getDb(), tournament, {
          now: now(),
        });
  return (
    <GamesView tournament={tournament} page={page} flash={await readFlash()} />
  );
}
