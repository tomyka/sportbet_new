import { loadTournamentPage } from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentPageView } from '../../../components/tournament/tournament-page-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { cachedPublicLeague } from '../../../server/public-league';
import { hubViewer } from '../../../server/viewer';

/**
 * TournamentController::show: the tournament's card, then its public
 * league's table and medals (R-73), for a guest too, from a read at most a
 * minute old (cachedPublicLeague).
 */
export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const page = await loadTournamentPage(
    getDb(),
    slug.data,
    await hubViewer(),
    now(),
    ruledRules,
  );
  if (page === null) notFound();
  const { table, medals } = await cachedPublicLeague(page.tournament);
  return <TournamentPageView page={page} table={table} medals={medals} />;
}
