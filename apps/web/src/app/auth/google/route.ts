import { cookies } from 'next/headers';
import { now } from '../../../server/clock';
import {
  googleResponse,
  startWorld,
} from '../../../server/google/google-worlds';
import { startGoogle } from '../../../server/google/start';
import { clientIp } from '../../../server/request/client-ip';

export const dynamic = 'force-dynamic';

/**
 * GoogleAuthController::redirectToGoogle at sportbet's address (slice 19,
 * #40): answered by startGoogle (server/google/start.ts), a real 303, never
 * cached. No same-origin check: the button is a plain link, and Google's
 * return is cross-site by nature - the sealed cookie and `state` are the
 * defence.
 */
export async function GET(request: Request): Promise<Response> {
  const jar = await cookies();
  const at = now();
  const answer = await startGoogle(startWorld(jar), {
    ip: clientIp(request.headers),
    at,
  });
  return googleResponse(answer, jar, at);
}
