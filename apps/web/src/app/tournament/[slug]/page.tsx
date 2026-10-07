import {
  loadLeagueMedals,
  loadLeagueTable,
  loadTournamentPage,
} from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentPageView } from '../../../components/tournament/tournament-page-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { hubViewer } from '../../../server/viewer';

/**
 * TournamentController::show: the tournament's card, then its public
 * league's table and medals (R-73), for a guest too.
 */
export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const db = getDb();
  const page = await loadTournamentPage(
    db,
    slug.data,
    await hubViewer(),
    now(),
    ruledRules,
  );
  if (page === null) notFound();
  return (
    <TournamentPageView
      page={page}
      table={await loadLeagueTable(db, page.tournament, ruledRules)}
      medals={await loadLeagueMedals(db, page.tournament, ruledRules)}
    />
  );
}
