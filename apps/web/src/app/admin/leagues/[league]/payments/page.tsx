import type { JSX } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PaymentsView } from '../../../../../components/leagues/payments-page';
import { adminPaymentsPaths } from '../../../../../components/leagues/payments-paths';
import { openAdminPayments } from '../../../../../server/admin/league-payments';
import { readFlash } from '../../../../../server/flash';

/**
 * LeaguePaymentController::adminEdit, behind the superadmin tier: decided by
 * openAdminPayments; this page draws the league's payments through the
 * admin door, or answers 404, or goes home.
 */
export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<JSX.Element> {
  await connection();
  const opened = await openAdminPayments((await params).league);
  if (opened.kind === 'home') redirect('/');
  if (opened.kind === 'not-found') notFound();
  return (
    <PaymentsView
      page={opened.page}
      flash={await readFlash()}
      paths={adminPaymentsPaths(opened.page.league.id)}
    />
  );
}
