import type { JSX } from 'react';
import { loadPaymentsPage } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PaymentsView } from '../../../../components/leagues/payments-page';
import { getDb } from '../../../../server/db';
import { readFlash } from '../../../../server/flash';
import { openPayments } from '../../../../server/leagues/open-payments';
import { signedInPlayer } from '../../../../server/request-context';

/**
 * LeaguePaymentController::edit: decided by openPayments
 * (server/leagues/open-payments.ts); this page draws the league's payments,
 * or answers 404, or goes where it says.
 */
export default async function PaymentsRoute({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<JSX.Element> {
  await connection();
  const opened = await openPayments((await params).league, {
    signedIn: signedInPlayer,
    load: (query) => loadPaymentsPage(getDb(), { ...query, rules: ruledRules }),
  });
  if (opened.kind === 'page') {
    return <PaymentsView page={opened.page} flash={await readFlash()} />;
  }
  if (opened.kind === 'not-found') notFound();
  redirect(opened.to);
}
