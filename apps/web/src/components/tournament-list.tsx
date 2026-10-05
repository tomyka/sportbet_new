import { formatLabel, type Tournament } from '@sportbet/domain';
import Link from 'next/link';

export function TournamentList({
  tournaments,
}: {
  tournaments: readonly Tournament[];
}) {
  if (tournaments.length === 0) return <p>Turnyrų kol kas nėra</p>;
  return (
    <ul>
      {tournaments.map((tournament) => (
        <li key={tournament.id}>
          <Link href={`/tournament/${tournament.slug}`}>{tournament.name}</Link>{' '}
          ({formatLabel(tournament.format)})
        </li>
      ))}
    </ul>
  );
}
