import type { PlayerId } from '@sportbet/domain';
import { signedInPlayer } from '../request-context';
import { isSameOrigin } from './same-origin';

// The route handlers' answers, written once. Every write answers with a
// real 303 (seeOther), so the browser asks for the next page and proxy.ts
// hands that page its one-time message.

/** A 303 to `location`, with no body. */
export const seeOther = (location: string): Response =>
  new Response(null, { status: 303, headers: { Location: location } });

/** A bare 404: an unknown tournament, or one the viewer may not see (R-50). */
export const notFound = (): Response => new Response(null, { status: 404 });

/** A bare 403: a state-changing request from another site (#16). */
export const forbidden = (): Response => new Response(null, { status: 403 });

/** The same-origin guard for a POST (#16): the 403 to answer with, or null when the request is this site's. */
export function refuseCrossSite(request: Request): Response | null {
  return isSameOrigin(request.headers) ? null : forbidden();
}

/**
 * Every autosave's POST (the prediction save, the standings saves), from
 * this site only (#16): a guest gets sportbet's `auth` answer to a JSON
 * request, 401 (decision 8); a body that is no form is read as an empty
 * one; the player's save answers with its status and JSON body.
 */
export async function autosaveRoute(
  request: Request,
  save: (
    player: PlayerId,
    form: FormData,
  ) => Promise<{ readonly status: number; readonly body: unknown }>,
): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await signedInPlayer();
  if (signedIn === null) {
    return Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  }
  const form = await request.formData().catch(() => new FormData());
  const answer = await save(signedIn.player, form);
  return Response.json(answer.body, { status: answer.status });
}
