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
