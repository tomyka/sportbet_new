import { loadResultsPage } from '@sportbet/db';
import { mayEnterResults, ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ResultsView } from '../../../components/admin/results-view';
import { adminGate } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { readFlash } from '../../../server/flash';
import { requestContext } from '../../../server/request-context';

/** getResultsCurrentRound: the current round (R-6, R-40) of the tournament the admin has open (decision 4). */
export default async function AdminResultsPage() {
  await connection();
  if ((await adminGate(mayEnterResults)) === null) redirect('/');
  const context = await requestContext();
  const flash = await readFlash();
  if (context.tournament === null) {
    return <ResultsView page={{ rounds: [], games: [] }} flash={flash} />;
  }
  const page = await loadResultsPage(getDb(), {
    tournament: context.tournament.tournament,
    round: context.tournament.currentRound,
    now: now(),
    rules: ruledRules,
  });
  return <ResultsView page={page} flash={flash} />;
}
