import { setReceiveReminders } from '@sportbet/db';
import { cookies } from 'next/headers';
import { env } from '../../../../../../env';
import { now } from '../../../../../../server/clock';
import { getDb } from '../../../../../../server/db';
import { writeFlash } from '../../../../../../server/flash';
import { answerUnsubscribe } from '../../../../../../server/reminders/unsubscribe';

/**
 * The unsubscribe button's POST and RFC 8058's one-click POST (R-98), at
 * `/profile/notifications/unsubscribe/{user}/confirm?signature=...`: POST
 * only (Next answers any other method 405), answered by answerUnsubscribe
 * (server/reminders/unsubscribe.ts), where the signature is the authority
 * and the same-origin check is left out on purpose.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ user: string }> },
): Promise<Response> {
  const { user } = await context.params;
  const secret = env().AUTH_SECRET;
  return answerUnsubscribe(request, user, {
    secret,
    turnOff: async (player) => {
      const done = await setReceiveReminders(getDb(), { player, on: false });
      return done.ok ? 'turned-off' : done.refusal;
    },
    leaveMessage: async () => {
      writeFlash(await cookies(), { kind: 'reminders-off' }, now(), secret);
    },
  });
}
