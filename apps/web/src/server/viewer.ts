import type { HubViewer } from '@sportbet/db';
import { isAdmin } from '@sportbet/domain';
import { signedInPlayer } from './request-context';

/** Who the hub and the tournament pages are drawn for: the signed-in player, if any, and whether an admin (R-50). */
export async function hubViewer(): Promise<HubViewer> {
  const signedIn = await signedInPlayer();
  return signedIn === null
    ? { player: null, isAdmin: false }
    : { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) };
}
