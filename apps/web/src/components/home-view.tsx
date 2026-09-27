import type { Tournament } from '@sportbet/domain';
import { TournamentList } from './tournament-list';

export function HomeView({
  tournaments,
}: {
  tournaments: readonly Tournament[];
}) {
  return (
    <main>
      <h1>Tournaments</h1>
      <TournamentList tournaments={tournaments} />
    </main>
  );
}
