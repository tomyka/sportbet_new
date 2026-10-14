import {
  ID_TEXT,
  idFromText,
  playerId,
  type IdTextRefusal,
  type PlayerId,
  type Result,
} from '@sportbet/domain';

// The compare page's address, in one place: the text of a /compare/{userID}
// URL, the id it names, the player, and the path back. The link, the
// request and the guest's sign-in return all read it through here.

/** The id a compare address names, read as every typed id is (idFromText); null for one no page reads. */
export function compareIdOf(text: string): number | null {
  const id = idFromText(text);
  return id.ok ? id.value : null;
}

/** /compare/{id}: the one place the path is built. */
export const comparePath = (id: number): string => `/compare/${String(id)}`;

/** The path of a compare page whose id a page reads, as a guest's sign-in may return to it. */
const COMPARE_PAGE = new RegExp(`^/compare/(${ID_TEXT})$`, 'u');

/** Whether `path` is the compare page of an id a page reads (the guarded page's shape). */
export const isComparePath = (path: string): boolean => {
  const text = COMPARE_PAGE.exec(path)?.[1];
  return text !== undefined && compareIdOf(text) !== null;
};

/**
 * sportbet's route constraint `where('userID', '[0-9]+')`: any other userID
 * matches no route, so it is a 404 for a guest as for a player.
 */
export const isRouteUserId = (userID: string): boolean =>
  /^[0-9]+$/u.test(userID);

/**
 * The player a compare URL names: its userID read as every id typed into a
 * URL is (idFromText: digits, no leading 0, within Postgres' integer).
 */
export function otherPlayerOf(
  userID: string,
): Result<PlayerId, IdTextRefusal | 'empty'> {
  const typed = idFromText(userID);
  return typed.ok ? playerId(String(typed.value)) : typed;
}

/**
 * Where a player's name in the league table leads: their compare page, or
 * nowhere for an id that page would not read, so no link leads to a 404.
 */
export function compareLinkOf(player: PlayerId): string | null {
  const id = compareIdOf(player);
  return id === null ? null : comparePath(id);
}
