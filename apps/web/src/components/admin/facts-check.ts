import type { AdminMessage } from '../../server/admin/admin-messages';

/**
 * What the facts form can tell before it is sent, so a refusal the server
 * would make does not cost the admin a table of typed places (a refused
 * post comes back as a fresh page): two teams at one place, and the table
 * marked final while its places are not exactly 1..N (R-92). The server
 * decides again (enterStandingsFacts); this only spares the typing.
 */
export function factsProblem(
  places: readonly string[],
  final: boolean,
): Extract<AdminMessage, 'duplicate-place' | 'places-incomplete'> | null {
  const entered = places.filter((place) => place.trim() !== '').map(Number);
  if (new Set(entered).size !== entered.length) return 'duplicate-place';
  const complete =
    entered.length === places.length &&
    [...entered]
      .sort((a, b) => a - b)
      .every((place, index) => place === index + 1);
  return final && !complete ? 'places-incomplete' : null;
}
