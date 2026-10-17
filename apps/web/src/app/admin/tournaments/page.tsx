import type { JSX } from 'react';
import { loadAdminTournaments } from '@sportbet/db/admin';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentsView } from '../../../components/admin/tournaments-view';
import { adminGate } from '../../../server/admin/gate';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

/** TournamentController::adminIndex, behind the superadmin tier (R-26 amended): every tournament, newest first. */
export default async function AdminTournamentsPage(): Promise<JSX.Element> {
  await connection();
  if ((await adminGate(isSuperadmin)) === null) redirect('/');
  return (
    <TournamentsView
      tournaments={await loadAdminTournaments(getDb())}
      flash={await readFlash()}
    />
  );
}
