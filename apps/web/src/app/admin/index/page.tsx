import type { JSX } from 'react';
import { isAdmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AdminIndexView } from '../../../components/admin/admin-index-view';
import { adminGate } from '../../../server/admin/gate';
import { readFlash } from '../../../server/flash';

/** admin.index, behind AdminMiddleware (R-26 amended): a non-admin goes home (decision 2). */
export default async function AdminPage(): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isAdmin);
  if (admin === null) redirect('/');
  return <AdminIndexView role={admin.role} flash={await readFlash()} />;
}
