import { LOGIN_CODE_DIGITS, type EmailAddress } from '@sportbet/domain';
import type { OutgoingMail } from './mail';
import {
  calloutBody,
  calloutValue,
  mailFrame,
  type CalloutText,
} from './mail-frame';

/** A code mail's own three lines: the subject (its heading too), the lead, and the line for whoever did not ask. */
export type CodeMailText = CalloutText;

const CODE = new RegExp(`^\\d{${String(LOGIN_CODE_DIGITS)}}$`);

/**
 * sportbet's code-mail layout (emails/login-code.blade.php and
 * emails/registration-code.blade.php share it): a heading, the lead, the
 * code, and the line for whoever did not ask. Its colours are the
 * template's own, inline - no inbox reads the app's tokens
 * (token-guard.test.ts allows them in the mail files only; the frame is
 * mail-frame.ts). The text part is this app's, for clients that show no HTML.
 */
export function codeMail(
  to: EmailAddress,
  code: string,
  text: CodeMailText,
): OutgoingMail {
  if (!CODE.test(code)) {
    throw new Error(`codeMail: not an ${String(LOGIN_CODE_DIGITS)}-digit code`);
  }
  const html = mailFrame(calloutBody(text, calloutValue(code)));
  return {
    to,
    subject: text.subject,
    html,
    text: [text.subject, '', text.lead, '', code, '', text.ignore].join('\n'),
  };
}
