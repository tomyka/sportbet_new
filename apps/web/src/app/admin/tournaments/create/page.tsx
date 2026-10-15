import type { JSX } from 'react';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentFormView } from '../../../../components/admin/tournament-form-view';
import { adminGate } from '../../../../server/admin/gate';
import { readFlash } from '../../../../server/flash';

/** TournamentController::adminCreate, behind the superadmin tier (R-26 amended): the empty form. */
export default async function AdminTournamentCreatePage(): Promise<JSX.Element> {
  await connection();
  if ((await adminGate(isSuperadmin)) === null) redirect('/');
  return <TournamentFormView existing={null} flash={await readFlash()} />;
}
