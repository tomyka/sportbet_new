import { LOGIN_CODE_TTL_MINUTES, type EmailAddress } from '@sportbet/domain';
import { codeMail } from './code-mail';
import type { OutgoingMail } from './mail';

/**
 * The code that confirms a destructive superadmin action (R-26 amended):
 * its own mail, naming the action in words, because the code is
 * interchangeable with no sign-in's - and says so, with what to do when
 * nobody asked. `action` is written by this app (confirm/actions.ts), from
 * ids only, never from anything an admin typed or an import brought: a code
 * mail's markup is not escaped, so a character that could open a tag is a
 * programming error.
 */
export function adminConfirmationMail(
  to: EmailAddress,
  code: string,
  action: string,
): OutgoingMail {
  if (/[<>&"]/.test(action)) {
    throw new Error('adminConfirmationMail: the action holds markup');
  }
  return codeMail(to, code, {
    subject: 'Veiksmo patvirtinimo kodas',
    lead: `Įveskite šį kodą administravimo puslapyje, kad patvirtintumėte veiksmą: ${action}. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`,
    ignore:
      'Jei šio veiksmo neprašėte, ignoruokite šį laišką - niekas nebus pakeista. Šiuo kodu prisijungti negalima.',
  });
}
