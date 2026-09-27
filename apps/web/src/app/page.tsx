import { listTournaments } from '@sportbet/db';
import { connection } from 'next/server';
import { TournamentList } from '../components/tournament-list';
import { getDb } from '../server/db';

export default async function HomePage() {
  await connection(); // per request, never prerendered at build
  const tournaments = await listTournaments(getDb());
  return (
    <main>
      <h1>Tournaments</h1>
      <TournamentList tournaments={tournaments} />
    </main>
  );
}
