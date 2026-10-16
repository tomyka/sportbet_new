import type { PlayerId } from '@sportbet/domain';
import { z } from 'zod';
import { seal, unseal } from '../sealed';

/** What the seal is for: a flash or a sign-in's value never opens as an unsubscribe link, nor the reverse. */
const PURPOSE = 'reminders-unsubscribe';

const payloadSchema = z.object({ player: z.string().min(1) });

/**
 * The signature of a player's unsubscribe link (R-98): the player, sealed
 * under AUTH_SECRET for this purpose. No expiry, as sportbet's `signed` URL
 * has none: the link in an old mail must still work, and all it can do is
 * turn that player's reminders off.
 */
export function unsubscribeSignature(player: PlayerId, secret: string): string {
  return seal(PURPOSE, { player }, secret);
}

/**
 * Whether `signature` was made by `unsubscribeSignature` for this very
 * player: forged, tampered, another player's, another purpose's and a
 * Laravel signature from before the switch-over (open question 3) all say no.
 */
export function signatureOpensFor(
  player: PlayerId,
  signature: string | null | undefined,
  secret: string,
): boolean {
  const payload = payloadSchema.safeParse(
    unseal(PURPOSE, signature ?? undefined, secret),
  );
  return payload.success && payload.data.player === player;
}

/** A player's two unsubscribe addresses: the confirm page, and the one-click handler. */
export interface UnsubscribeLinks {
  readonly unsubscribeUrl: string;
  readonly oneClickUrl: string;
}

/**
 * The two paths: the page keeps sportbet's own
 * (`/profile/notifications/unsubscribe/{user}?signature=...`), and the
 * one-click handler is the same address plus `/confirm`, where the page's
 * button posts too. The signature is a sealed value (base64url and a dot),
 * so it needs no escaping in a query or an attribute.
 */
export function unsubscribePaths(
  player: PlayerId,
  signature: string,
): { readonly pagePath: string; readonly confirmPath: string } {
  const base = `/profile/notifications/unsubscribe/${player}`;
  const query = `?signature=${signature}`;
  return {
    pagePath: `${base}${query}`,
    confirmPath: `${base}/confirm${query}`,
  };
}

/** The two addresses a mail carries, on the site's origin. */
export function unsubscribeLinks(
  appUrl: string,
  player: PlayerId,
  secret: string,
): UnsubscribeLinks {
  const { pagePath, confirmPath } = unsubscribePaths(
    player,
    unsubscribeSignature(player, secret),
  );
  return {
    unsubscribeUrl: `${appUrl}${pagePath}`,
    oneClickUrl: `${appUrl}${confirmPath}`,
  };
}
