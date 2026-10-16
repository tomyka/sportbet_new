import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * sportbet's EmailChangeCodeMail (issue 289, R-24): the code that makes the
 * address it is mailed to the account's own. It goes to the new address, not
 * the old one, so only a mailbox the player reads can claim it.
 */
export function emailChangeCodeMail(
  to: EmailAddress,
  code: string,
): OutgoingMail {
  return codeMail(to, code, {
    subject: 'El. pašto keitimo patvirtinimo kodas',
    lead: `Įveskite šį kodą, kad šis adresas taptų jūsų paskyros el. paštu. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore:
      'Jei neprašėte keisti el. pašto, ignoruokite šį laišką - paskyra liks su senuoju adresu. Šiuo kodu prisijungti negalima.',
  });
}
