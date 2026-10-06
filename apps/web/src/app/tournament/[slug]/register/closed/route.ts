import { cookies } from 'next/headers';
import { env } from '../../../../../env';
import { now } from '../../../../../server/clock';
import { writeFlash } from '../../../../../server/flash';

/**
 * The form's "closed" answer (registerForm's redirect to the hub with
 * "Registracija į šį turnyrą jau pasibaigė."): a page cannot set a cookie,
 * so the form sends the player here, which leaves that one message and
 * goes home. It writes nothing else; anyone opening it only sees the
 * message once.
 */
export async function GET(): Promise<Response> {
  writeFlash(
    await cookies(),
    { kind: 'registration-closed' },
    now(),
    env().AUTH_SECRET,
  );
  return new Response(null, { status: 303, headers: { Location: '/' } });
}
