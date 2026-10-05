import { formatLabel, type Tournament } from '@sportbet/domain';
import { BackToList } from './back-to-list';

export function TournamentDetails({ tournament }: { tournament: Tournament }) {
  return (
    <article>
      <h1>{tournament.name}</h1>
      <p>Formatas: {formatLabel(tournament.format)}</p>
      <BackToList />
    </article>
  );
}
