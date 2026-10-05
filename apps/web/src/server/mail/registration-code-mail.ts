import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * sportbet's RegistrationCodeMail (sportbet issue 102): its own mail rather than the
 * sign-in one, because the codes are not interchangeable and this is the
 * one code that goes to an address with no account behind it - so the
 * mail says which code it is, and that it signs nobody in.
 */
export function registrationCodeMail(
  to: EmailAddress,
  code: string,
): OutgoingMail {
  return codeMail(to, code, {
    subject: 'Registracijos patvirtinimo kodas',
    lead: `Įveskite šį kodą registracijos lange, kad užbaigtumėte registraciją. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore:
      'Jei neregistravotės, ignoruokite šį laišką - paskyra nebus sukurta. Šiuo kodu prisijungti negalima.',
  });
}
