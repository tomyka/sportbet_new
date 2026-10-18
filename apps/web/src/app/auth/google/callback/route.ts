import { cookies } from 'next/headers';
import { now } from '../../../../server/clock';
import { completeGoogle } from '../../../../server/google/complete';
import {
  callbackWorld,
  googleResponse,
} from '../../../../server/google/google-worlds';
import { clientIp } from '../../../../server/request/client-ip';

export const dynamic = 'force-dynamic';

/**
 * GoogleAuthController::handleGoogleCallback at sportbet's address (slice
 * 19, #40): answered by completeGoogle (server/google/complete.ts), a real
 * 303, never cached. It reads the query's `error`, `code` and `state` and
 * nothing else of the request: the redirect URI is derived, and who the
 * visitor is comes from Google through the exchange.
 */
export async function GET(request: Request): Promise<Response> {
  const jar = await cookies();
  const at = now();
  const query = new URL(request.url).searchParams;
  const answer = await completeGoogle(callbackWorld(jar), {
    error: query.get('error'),
    code: query.get('code'),
    state: query.get('state'),
    ip: clientIp(request.headers),
    at,
  });
  return googleResponse(answer, jar, at);
}
