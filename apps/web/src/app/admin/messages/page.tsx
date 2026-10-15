import type { JSX } from 'react';
import { loadAdminMessages, type AdminMessages } from '@sportbet/db';
import { isSuperadmin, mayEditMessages } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { MessagesView } from '../../../components/admin/messages-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

const NOTHING: AdminMessages = { messages: [], leagues: [] };

/**
 * MessageController::getMessageAll, behind the editors' tier (R-116: a
 * results manager or a superadmin): the messages of the tournament the admin
 * works on (R-95) and the detached ones; only a superadmin is offered the
 * delete.
 */
export default async function AdminMessagesPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(mayEditMessages);
  if (admin === null) redirect('/');
  const tournament = await workingTournament(admin.player);
  const data =
    tournament === null
      ? NOTHING
      : await loadAdminMessages(getDb(), tournament.id);
  return (
    <MessagesView
      data={data}
      tournament={tournament}
      canDelete={isSuperadmin(admin.role)}
      flash={await readFlash()}
    />
  );
}
