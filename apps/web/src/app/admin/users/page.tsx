import type { JSX } from 'react';
import { loadAdminUsers } from '@sportbet/db/admin';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { UsersView } from '../../../components/admin/users-view';
import { adminGate } from '../../../server/admin/gate';
import { workingTournament } from '../../../server/admin/working-tournament';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';

/**
 * UserController::getAllUsersFull, behind the superadmin tier (R-26
 * amended): every account by id with its role and its hide in the tournament
 * the admin works on (R-115).
 */
export default async function AdminUsersPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const tournament = await workingTournament(admin.player);
  const users = await loadAdminUsers(getDb(), tournament?.id ?? null);
  return (
    <UsersView
      users={users}
      viewer={admin.player}
      tournament={tournament}
      flash={await readFlash()}
    />
  );
}
