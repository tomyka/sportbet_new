import type { MailEnv } from '../../env';
import { allowListMailer } from './allow-list';
import type { Fetch, Mailer } from './mail';
import { mailpitMailer } from './mailpit';
import { resendMailer } from './resend';

/** The mailer the environment names (env.ts, mailEnvSchema). */
export function createMailer(
  config: MailEnv,
  fetchFn: Fetch = fetch,
  warn: (message: string) => void = (message) => {
    console.warn(message);
  },
): Mailer {
  switch (config.MAIL_TRANSPORT) {
    case 'mailpit':
      return mailpitMailer(
        config.MAILPIT_URL,
        config.MAIL_FROM_ADDRESS,
        fetchFn,
      );
    case 'resend':
      return resendMailer(
        config.RESEND_API_KEY,
        config.MAIL_FROM_ADDRESS,
        fetchFn,
      );
    case 'resend-allow-list':
      return allowListMailer(
        resendMailer(config.RESEND_API_KEY, config.MAIL_FROM_ADDRESS, fetchFn),
        config.MAIL_ALLOWED_RECIPIENTS,
        warn,
      );
  }
}
