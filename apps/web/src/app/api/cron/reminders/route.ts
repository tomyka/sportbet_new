import { env, reminderEnv } from '../../../../env';
import { answerCron } from '../../../../server/reminders/cron-answer';
import { sendReminders } from '../../../../server/reminders/send-reminders';
import { remindersWorld } from '../../../../server/reminders/world';

export const dynamic = 'force-dynamic';

/** Resend's sends are spaced and one run is bounded by a time budget (send-reminders.ts), well inside this. */
export const maxDuration = 60;

/**
 * Sends the due prediction reminders (R-97): the GitHub Actions schedule
 * calls it every 15 minutes on staging, a systemd timer on the Oracle host
 * in production. POST only (Next answers any other method 405), outside
 * proxy.ts's matcher: it needs no session and no flash. Answered by
 * answerCron (server/reminders/cron-answer.ts), guarded by the bearer
 * CRON_SECRET alone. The settings are read lazily here (`reminderEnv`): a
 * missing or bad CRON_SECRET or APP_URL (without the address no link can be
 * made) is "not configured", 503, and stops nothing else on the site.
 */
export function POST(request: Request): Promise<Response> {
  const reminders = reminderEnv();
  return answerCron(request, {
    secret: reminders?.CRON_SECRET,
    run: () => sendReminders(remindersWorld(env(), reminders?.APP_URL)),
  });
}
