import type { HubViewer, PlayerViewer, SignedInPlayer } from '@sportbet/db';
import { isAdmin } from '@sportbet/domain';
import { signedInPlayer } from './request-context';

/** The R-50 viewer a signed-in player is: who, and whether an admin. Built here only. */
export function viewerOf(signedIn: SignedInPlayer): PlayerViewer {
  return { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) };
}

/** Who the hub and the tournament pages are drawn for: the signed-in player, if any (R-50). */
export async function hubViewer(): Promise<HubViewer> {
  const signedIn = await signedInPlayer();
  return signedIn === null
    ? { player: null, isAdmin: false }
    : viewerOf(signedIn);
}

/** The signed-in player as a viewer, or null for a guest: what enter, the form and its submit act for. */
export async function playerViewer(): Promise<PlayerViewer | null> {
  const signedIn = await signedInPlayer();
  return signedIn === null ? null : viewerOf(signedIn);
}
