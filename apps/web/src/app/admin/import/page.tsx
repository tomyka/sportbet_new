import type { JSX } from 'react';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ImportFormView } from '../../../components/admin/import/import-form-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { readFlash } from '../../../server/flash';

/** EuroleagueImportController::index, behind the superadmin tier (R-26 amended): the season form for the tournament the admin works on, and the one-time message. */
export default async function AdminImportPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  return (
    <ImportFormView
      tournament={await workingTournament(admin.player)}
      flash={await readFlash()}
    />
  );
}
