import type { EmailAddress } from '@sportbet/domain';
import type { Mailer, MailOutcome } from './mail';

/**
 * Staging's mail (spec 4b): only an address on the allow-list - the
 * owner's - is mailed; any other is refused and logged, without the
 * address. Staging holds fake data only, so no real player is ever mailed.
 */
export function allowListMailer(
  inner: Mailer,
  allowed: readonly EmailAddress[],
  warn: (message: string) => void,
): Mailer {
  return {
    send: (mail) => {
      if (!allowed.includes(mail.to)) {
        warn(
          'mail: refused a message to an address not on the staging allow-list',
        );
        return Promise.resolve<MailOutcome>('refused');
      }
      return inner.send(mail);
    },
  };
}
