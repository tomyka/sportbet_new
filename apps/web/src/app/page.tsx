import { listTournaments } from '@sportbet/db';
import { connection } from 'next/server';
import { HomeView } from '../components/home-view';
import { getDb } from '../server/db';

export default async function HomePage() {
  await connection(); // per request, never prerendered at build
  const tournaments = await listTournaments(getDb());
  return <HomeView tournaments={tournaments} />;
}
