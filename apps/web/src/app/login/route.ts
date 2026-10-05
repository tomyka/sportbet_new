import { cookies } from 'next/headers';
import { OPEN_SIGN_IN_COOKIE, setCookie } from '../../server/cookies';
import { signedInPlayer } from '../../server/request-context';

/**
 * sportbet's AuthenticatedSessionController::create (issue 111): renders
 * nothing; a guest goes to '/' with the sign-in dialog to open there; a
 * signed-in visitor just goes to '/'. A `?tournament=` steers nothing:
 * sportbet keeps it for registration only (4c; review W5).
 */
export async function GET(): Promise<Response> {
  if ((await signedInPlayer()) === null) {
    setCookie(await cookies(), OPEN_SIGN_IN_COOKIE, '1');
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
