import type { JSX } from 'react';
import { loadAdminLeagueMembers } from '@sportbet/db/league';
import { isSuperadmin } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { LeagueMembersView } from '../../../../../components/admin/league-members-view';
import { adminGate } from '../../../../../server/admin/gate';
import { workingTournament } from '../../../../../server/admin/working-tournament';
import { getDb } from '../../../../../server/db';
import { readFlash } from '../../../../../server/flash';
import { asLeague } from '../../../../../server/leagues/id-field';
import { readLeagueSegment } from '../../../../../server/leagues/league-segment';

/**
 * A league's members and the guest mark (R-87), behind the superadmin tier:
 * a segment that is no id, no working tournament, or a league of another
 * tournament is a 404.
 */
export default async function AdminLeagueMembersPage({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const id = readLeagueSegment((await params).league);
  const tournament = await workingTournament(admin.player);
  if (id === null || tournament === null) notFound();
  const data = await loadAdminLeagueMembers(getDb(), {
    tournament: tournament.id,
    league: asLeague(id),
  });
  if (data === null) notFound();
  return <LeagueMembersView data={data} flash={await readFlash()} />;
}
