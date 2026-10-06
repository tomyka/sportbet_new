import { loadRegistrationForm } from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../../../../env';
import { now } from '../../../../../server/clock';
import { getDb } from '../../../../../server/db';
import { writeFlash } from '../../../../../server/flash';
import { seeOther } from '../../../../../server/request/route-responses';
import { playerViewer } from '../../../../../server/viewer';

interface Context {
  readonly params: Promise<{ slug: string }>;
}

/**
 * The form's "closed" answer (registerForm's redirect to the hub with
 * "Registracija į šį turnyrą jau pasibaigė."): a page cannot set a cookie,
 * so the form sends the player here, which leaves that one message and
 * goes home - only when the tournament, as this player may see it (R-50),
 * really is closed to them. Anyone else is just sent home. It writes
 * nothing but the message.
 */
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  const viewer = await playerViewer();
  const slug = slugSchema.safeParse((await params).slug);
  if (viewer === null || !slug.success) return seeOther('/');
  const at = now();
  const form = await loadRegistrationForm(
    getDb(),
    slug.data,
    viewer,
    at,
    ruledRules,
  );
  if (form?.step === 'closed') {
    writeFlash(
      await cookies(),
      { kind: 'registration-closed' },
      at,
      env().AUTH_SECRET,
    );
  }
  return seeOther('/');
}
