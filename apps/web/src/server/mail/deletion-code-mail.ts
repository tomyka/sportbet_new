import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * sportbet's AccountDeletionCodeMail: the code that lets the account's owner
 * delete it from the profile (R-25). Its own mail, because a code is no
 * other purpose's, and it says so and what to do when nobody asked.
 */
export function deletionCodeMail(to: EmailAddress, code: string): OutgoingMail {
  return codeMail(to, code, {
    subject: 'Paskyros ištrynimo patvirtinimo kodas',
    lead: `Įveskite šį kodą, kad patvirtintumėte paskyros ištrynimą. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore:
      'Jei neprašėte ištrinti paskyros, ignoruokite šį laišką - paskyra nebus ištrinta. Šiuo kodu prisijungti negalima.',
  });
}
