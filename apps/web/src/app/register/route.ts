import { registerPageLimits } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { now } from '../../server/clock';
import { OPEN_SIGN_IN_COOKIE, setCookie } from '../../server/cookies';
import { getDb } from '../../server/db';
import { rememberIntended } from '../../server/register/intended';
import { registrationOpenAt } from '../../server/register/registration-window';
import { clientIp } from '../../server/request/client-ip';
import { signedInPlayer } from '../../server/request-context';
import { throttledText } from '../../server/sign-in/texts';
import { throttle } from '../../server/sign-in/throttle';

const home = () =>
  new Response(null, { status: 302, headers: { Location: '/' } });

/**
 * sportbet's RegisteredUserController::create (issue 111): renders nothing.
 * Throttled per IP (register-page; Q3: a 429 with the dialog's text); a
 * signed-in visitor, or anyone while registration is closed, just goes to
 * '/'; a guest goes to '/' with the dialog to open on its Registruotis tab,
 * a `?tournament=` slug remembered for the registration
 * (intended_tournament).
 */
export async function GET(request: Request): Promise<Response> {
  const at = now();
  const verdict = await throttle(
    getDb(),
    registerPageLimits(clientIp(request.headers)),
    at,
  );
  if (!verdict.allowed) {
    return new Response(throttledText(verdict.minutes), {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(verdict.minutes * 60),
      },
    });
  }
  if ((await signedInPlayer()) !== null || !(await registrationOpenAt(at))) {
    return home();
  }
  const jar = await cookies();
  rememberIntended(jar, new URL(request.url).searchParams.get('tournament'));
  setCookie(jar, OPEN_SIGN_IN_COOKIE, 'register');
  return home();
}
