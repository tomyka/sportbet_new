import type { Tournament } from '@sportbet/domain';
import { TournamentList } from './tournament-list';

export function HomeView({
  tournaments,
}: {
  tournaments: readonly Tournament[];
}) {
  return (
    <>
      <h1>Turnyrai</h1>
      <TournamentList tournaments={tournaments} />
    </>
  );
}
