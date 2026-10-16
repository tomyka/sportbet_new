import {
  loadReminderCandidates,
  loadReminderRecipients,
  markReminded,
  releaseJobLease,
  stillDueGames,
  takeJobLease,
} from '@sportbet/db';
import type { Env } from '../../env';
import { now } from '../clock';
import { getDb } from '../../server/db';
import { createMailer } from '../mail/create-mailer';
import {
  LEASE_MINUTES,
  REMINDERS_JOB,
  type RemindersWorld,
} from './send-reminders';

/**
 * The real world of a run: the database, the clock, the mailer the
 * environment names (Mailpit locally and in CI, Resend on staging and
 * production), and the site's address and key the links are made from.
 * The mailer is the only way mail leaves the app, and the cron route the
 * only caller of this.
 */
export function remindersWorld(
  config: Env,
  appUrl: string | undefined,
): RemindersWorld {
  if (appUrl === undefined) {
    // The route answers 503 before it gets here.
    throw new Error('remindersWorld: APP_URL is not set');
  }
  const db = getDb();
  const mailer = createMailer(config);
  const began = performance.now();
  return {
    appUrl,
    secret: config.AUTH_SECRET,
    now,
    elapsedMs: () => performance.now() - began,
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    takeLease: () => takeJobLease(db, REMINDERS_JOB, LEASE_MINUTES),
    releaseLease: (lease) => releaseJobLease(db, lease),
    loadCandidates: (at) => loadReminderCandidates(db, { now: at }),
    loadRecipients: (due) => loadReminderRecipients(db, due),
    stillDue: (due) => stillDueGames(db, due),
    send: (mail) => mailer.send(mail),
    mark: (marked) => markReminded(db, marked),
    logError: (message) => {
      console.error(message);
    },
  };
}
