import { findTournamentBySlug } from '@sportbet/db';
import { slugSchema } from '@sportbet/domain';
import { notFound } from 'next/navigation';
import { TournamentDetails } from '../../../components/tournament-details';
import { getDb } from '../../../server/db';

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const tournament = await findTournamentBySlug(getDb(), slug.data);
  if (tournament === undefined) notFound();
  return (
    <main>
      <TournamentDetails tournament={tournament} />
    </main>
  );
}
