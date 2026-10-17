import type { JSX } from 'react';
import { loadAdminLeagues } from '@sportbet/db/league';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { LeaguesView } from '../../../components/admin/leagues-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

/**
 * LeagueController::adminIndex, behind the superadmin tier (R-26 amended):
 * the leagues of the tournament the admin works on (R-95), the public one
 * first, then the newest.
 */
export default async function AdminLeaguesPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const tournament = await workingTournament(admin.player);
  const rows =
    tournament === null ? [] : await loadAdminLeagues(getDb(), tournament.id);
  return (
    <LeaguesView
      rows={rows}
      tournament={tournament}
      flash={await readFlash()}
    />
  );
}
