import type { JSX } from 'react';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { TeamInsertView } from '../../../components/admin/team-insert-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { readFlash } from '../../../server/flash';

/**
 * TeamController::getTeam at the insert URL, behind the superadmin tier
 * (R-26 amended): the placeholder form for the tournament the admin works on.
 */
export default async function AdminTeamInsertPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  return (
    <TeamInsertView
      tournament={await workingTournament(admin.player)}
      flash={await readFlash()}
    />
  );
}
