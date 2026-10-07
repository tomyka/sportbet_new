import { isAdmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AdminIndexView } from '../../../components/admin/admin-index-view';
import { adminGate } from '../../../server/admin/gate';

/** admin.index, behind AdminMiddleware (R-26 amended): a non-admin goes home (decision 2). */
export default async function AdminPage() {
  await connection();
  if ((await adminGate(isAdmin)) === null) redirect('/');
  return <AdminIndexView />;
}
