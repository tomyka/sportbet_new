import { formatLabel, type Tournament } from '@sportbet/domain';
import Link from 'next/link';

export function TournamentDetails({ tournament }: { tournament: Tournament }) {
  return (
    <main>
      <article>
        <h1>{tournament.name}</h1>
        <p>Format: {formatLabel(tournament.format)}</p>
        <p>
          <Link href="/">All tournaments</Link>
        </p>
      </article>
    </main>
  );
}
