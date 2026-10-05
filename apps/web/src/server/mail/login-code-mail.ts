import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * sportbet's LoginCodeMail: the lead states the code's life from the
 * constant its expiry is set from (#76).
 */
export function loginCodeMail(to: EmailAddress, code: string): OutgoingMail {
  return codeMail(to, code, {
    subject: 'Jūsų prisijungimo kodas',
    lead: `Įveskite šį kodą, kad prisijungtumėte. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore: 'Jei neprašėte šio kodo, galite ignoruoti šį laišką.',
  });
}
