import type { JSX } from 'react';
import { loadAdminTeams, type AdminTeamsPage } from '@sportbet/db/admin';
import {
  isSuperadmin,
  mayEnterStandingsFacts,
  mayUnmarkFinalTable,
} from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { TeamsView } from '../../../components/admin/teams-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

/** No teams: what the page shows while no tournament is chosen. */
const NOTHING: AdminTeamsPage = { teams: [], final: false };

/**
 * TeamController::getTeam, behind the standings-facts permission (R-26
 * amended): the teams of the tournament the admin works on and their facts,
 * or - with none - the placeholder form. A superadmin may also rename a team
 * and take the final mark off (R-92).
 */
export default async function AdminTeamsPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(mayEnterStandingsFacts);
  if (admin === null) redirect('/');
  const tournament = await workingTournament(admin.player);
  const page =
    tournament === null ? NOTHING : await loadAdminTeams(getDb(), tournament);
  return (
    <TeamsView
      tournament={tournament}
      page={page}
      may={{
        rename: isSuperadmin(admin.role),
        unmark: mayUnmarkFinalTable(admin.role),
      }}
      flash={await readFlash()}
    />
  );
}
