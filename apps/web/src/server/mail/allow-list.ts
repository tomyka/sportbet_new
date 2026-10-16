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
  const refuse = (to: EmailAddress): boolean => {
    if (allowed.includes(to)) return false;
    warn('mail: refused a message to an address not on the staging allow-list');
    return true;
  };
  return {
    mayDeliver: (to) => !refuse(to),
    send: (mail) =>
      refuse(mail.to)
        ? Promise.resolve<MailOutcome>('refused')
        : inner.send(mail),
  };
}
