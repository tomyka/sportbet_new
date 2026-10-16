import type { EmailAddress } from '@sportbet/domain';
import type { OutgoingMail } from './mail';
import {
  calloutBody,
  calloutLabel,
  calloutLine,
  escapeHtml,
  mailFrame,
} from './mail-frame';

const SUBJECT = 'Jūsų paskyros el. paštas pakeistas';
const NEW_ADDRESS = 'Naujas adresas';
const NOT_YOU = 'Jei to nedarėte, susisiekite su mumis nedelsdami.';

const leadOf = (newAddress: string): string =>
  `Paskyros, kuri naudojo šį adresą, el. paštas pakeistas į ${newAddress}. Prisijungimo kodai nuo šiol siunčiami ten.`;

/**
 * sportbet's EmailChangedNoticeMail (issue 289, R-24): told to the old
 * address once the move has happened, naming the new one. No code and no
 * link - there is nothing in it to phish or to click by mistake - and no
 * promise that the account can be recovered: nothing in the app does that.
 * The new address is escaped; the layout is the code mails' (calloutBody).
 */
export function emailChangedNoticeMail(
  to: EmailAddress,
  newAddress: EmailAddress,
): OutgoingMail {
  const html = mailFrame(
    calloutBody(
      {
        subject: SUBJECT,
        lead: escapeHtml(leadOf(newAddress)),
        ignore: NOT_YOU,
      },
      calloutLabel(NEW_ADDRESS) + calloutLine(escapeHtml(newAddress)),
    ),
  );
  return {
    to,
    subject: SUBJECT,
    html,
    text: [
      SUBJECT,
      '',
      leadOf(newAddress),
      '',
      `${NEW_ADDRESS}: ${newAddress}`,
      '',
      NOT_YOU,
    ].join('\n'),
  };
}
