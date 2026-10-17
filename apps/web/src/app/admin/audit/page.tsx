import type { JSX } from 'react';
import { loadAuditPage } from '@sportbet/db/admin';
import { auditPageQuery, isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AuditView } from '../../../components/admin/audit-view';
import { adminGate } from '../../../server/admin/gate';
import { getDb } from '../../../server/db';

/**
 * AuditController::index, behind the superadmin tier (R-26 amended, R-69):
 * the tab, the user filter and each tab's page read strictly from the query
 * by the domain (an array or a cast filters nobody, issue 281); every row is
 * parsed with the domain's schema in db.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const data = await loadAuditPage(getDb(), auditPageQuery(await searchParams));
  return <AuditView data={data} />;
}
