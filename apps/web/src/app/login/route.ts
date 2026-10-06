import { cookies } from 'next/headers';
import { OPEN_SIGN_IN_COOKIE, setCookie } from '../../server/cookies';
import { rememberIntended } from '../../server/register/intended';
import { signedInPlayer } from '../../server/request-context';
import { rememberReturn } from '../../server/sign-in/return-path';

/**
 * sportbet's AuthenticatedSessionController::create (issue 111): renders
 * nothing; a guest goes to '/' with the dialog to open there on its
 * sign-in tab, a `?tournament=` slug remembered for registration
 * (intended_tournament) - it steers nothing of a sign-in (review W5) -
 * and an `?intended=` path - the guarded page a guest came from - kept as
 * where sign-in returns (sportbet's url.intended; return-path.ts); a
 * signed-in visitor just goes to '/'.
 */
export async function GET(request: Request): Promise<Response> {
  if ((await signedInPlayer()) === null) {
    const jar = await cookies();
    const url = new URL(request.url);
    rememberIntended(jar, url.searchParams.get('tournament'));
    rememberReturn(jar, url.searchParams.get('intended'));
    setCookie(jar, OPEN_SIGN_IN_COOKIE, 'login');
  }
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
