import { loadTournamentPage } from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { TournamentPageView } from '../../../components/tournament/tournament-page-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { hubViewer } from '../../../server/viewer';

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
  return <TournamentPageView page={page} />;
}
