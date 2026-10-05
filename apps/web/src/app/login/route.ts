import { cookies } from 'next/headers';
import { OPEN_SIGN_IN_COOKIE, setCookie } from '../../server/cookies';
import { rememberIntended } from '../../server/register/intended';
import { signedInPlayer } from '../../server/request-context';

/**
 * sportbet's AuthenticatedSessionController::create (issue 111): renders
 * nothing; a guest goes to '/' with the dialog to open there on its
 * sign-in tab, a `?tournament=` slug remembered for registration
 * (intended_tournament) - it steers nothing of a sign-in (review W5); a
 * signed-in visitor just goes to '/'.
 */
export async function GET(request: Request): Promise<Response> {
  if ((await signedInPlayer()) === null) {
    const jar = await cookies();
    rememberIntended(jar, new URL(request.url).searchParams.get('tournament'));
    setCookie(jar, OPEN_SIGN_IN_COOKIE, 'login');
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
