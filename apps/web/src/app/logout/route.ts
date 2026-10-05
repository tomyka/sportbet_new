import { cookies } from 'next/headers';
import { getDb } from '../../server/db';
import { isSameOrigin } from '../../server/request/same-origin';
import { endSession } from '../../server/session/session';

/**
 * "Atsijungti" (AuthenticatedSessionController::destroy), at sportbet's URL
 * and method: POST only - Next answers any other method 405 (#16) - and
 * only from this site. It ends this browser's session (Q3) and goes back
 * to '/'.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers)) {
    return new Response(null, { status: 403 });
  }
  const jar = await cookies();
  await endSession(getDb(), jar, jar);
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
