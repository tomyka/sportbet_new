import type { JSX } from 'react';
import { NotFoundView } from '../../../components/not-found-view';

/**
 * The tournament pages' own not-found boundary, inside the root layout:
 * an unknown or hidden tournament (R-50) is shown "Puslapis nerastas" in
 * the shell. In Next 16.3.6 the server answers a page's notFound() with a
 * 404 and its bare error document, and the browser draws this boundary
 * from the flight data (routes.test.ts says why); only an address no route
 * matches is rendered on the server, by app/not-found.tsx.
 */
export default function TournamentNotFound(): JSX.Element {
  return <NotFoundView />;
}
