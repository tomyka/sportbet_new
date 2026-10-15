import type { JSX } from 'react';
import { loadAdminRounds } from '@sportbet/db';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RoundsView } from '../../../components/admin/rounds-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

/** EventController::getEvent, behind the superadmin tier (R-26 amended): the rounds of the tournament the admin works on. */
export default async function AdminEventsPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const tournament = await workingTournament(admin.player);
  const rounds =
    tournament === null ? [] : await loadAdminRounds(getDb(), tournament);
  return (
    <RoundsView
      tournament={tournament}
      rounds={rounds}
      flash={await readFlash()}
    />
  );
}
