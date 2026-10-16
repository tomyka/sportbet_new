import { LOGIN_CODE_DIGITS, type EmailAddress } from '@sportbet/domain';
import type { OutgoingMail } from './mail';
import { mailFrame } from './mail-frame';

/** A code mail's own three lines: the subject (its heading too), the lead, and the line for whoever did not ask. */
export interface CodeMailText {
  readonly subject: string;
  readonly lead: string;
  readonly ignore: string;
}

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
  const html = mailFrame([
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${text.subject}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 20px">${text.lead}</p>`,
    '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px">',
    `<span style="font-weight:700;font-size:1.8rem;letter-spacing:.4rem">${code}</span>`,
    '</div>',
    `<p style="color:#888;font-size:.8rem;margin:0">${text.ignore}</p>`,
  ]);
  return {
    to,
    subject: text.subject,
    html,
    text: [text.subject, '', text.lead, '', code, '', text.ignore].join('\n'),
  };
}
