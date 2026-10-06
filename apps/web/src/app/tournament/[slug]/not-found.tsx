import { NotFoundView } from '../../../components/not-found-view';

/**
 * The tournament pages' own not-found boundary, inside the root layout:
 * an unknown or hidden tournament (R-50) is answered with the shell and
 * "Puslapis nerastas" rendered on the server (#16: the root boundary
 * alone reached the browser as Next 16's bare error document).
 */
export default function TournamentNotFound() {
  return <NotFoundView />;
}
