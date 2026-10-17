import type { JSX } from 'react';
import { findAdminTournament } from '@sportbet/db/admin';
import { idFromText, isSuperadmin } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentFormView } from '../../../../../components/admin/tournament-form-view';
import { adminGate } from '../../../../../server/admin/gate';
import { getDb } from '../../../../../server/db';
import { readFlash } from '../../../../../server/flash';

/**
 * TournamentController::adminEdit, behind the superadmin tier (R-26
 * amended): the form filled with the tournament; an id that is no
 * tournament is a 404, as route-model binding makes it.
 */
export default async function AdminTournamentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  await connection();
  if ((await adminGate(isSuperadmin)) === null) redirect('/');
  const id = idFromText((await params).id);
  if (!id.ok) notFound();
  const existing = await findAdminTournament(getDb(), id.value);
  if (existing === undefined) notFound();
  return <TournamentFormView existing={existing} flash={await readFlash()} />;
}
