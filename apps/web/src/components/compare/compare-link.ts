import { idFromText, type PlayerId } from '@sportbet/domain';
import { comparePath } from '../shell/shell-paths';

/**
 * Where a player's name in the league table leads: their compare page, or
 * nowhere for an id that page would not read (idFromText), so no link
 * leads to a 404.
 */
export function compareLinkOf(player: PlayerId): string | null {
  const id = idFromText(player);
  return id.ok ? comparePath(id.value) : null;
}
