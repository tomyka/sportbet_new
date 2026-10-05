import {
  LOGIN_CODE_DIGITS,
  LOGIN_CODE_TTL_MINUTES,
  type EmailAddress,
} from '@sportbet/domain';
import type { OutgoingMail } from './mail';

const SUBJECT = 'Jūsų prisijungimo kodas';
const LEAD = `Įveskite šį kodą, kad prisijungtumėte. Kodas galioja ${String(LOGIN_CODE_TTL_MINUTES)} min.`;
const IGNORE = 'Jei neprašėte šio kodo, galite ignoruoti šį laišką.';
const CODE = new RegExp(`^\\d{${String(LOGIN_CODE_DIGITS)}}$`);

/**
 * sportbet's LoginCodeMail and emails/login-code.blade.php: the subject,
 * the lead stating the code's life from the constant its expiry is set
 * from (#76), the code, and the line for whoever did not ask. Its colours
 * are the template's own, inline - no inbox reads the app's tokens
 * (token-guard.test.ts allows them in this file only). The text part is
 * this app's, for clients that show no HTML.
 */
export function loginCodeMail(to: EmailAddress, code: string): OutgoingMail {
  if (!CODE.test(code)) {
    throw new Error(
      `loginCodeMail: not an ${String(LOGIN_CODE_DIGITS)}-digit code`,
    );
  }
  const html = [
    '<!DOCTYPE html>',
    '<html lang="lt">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head>',
    '<body style="font-family:sans-serif;background:#f0f0f0;margin:0;padding:20px">',
    '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">',
    '<div style="background:#1a1a2e;padding:18px 24px;text-align:center">',
    '<span style="color:#fff;font-size:1rem;font-weight:700;letter-spacing:.5px">SportBet</span>',
    '</div>',
    '<div style="padding:28px 24px">',
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${SUBJECT}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 20px">${LEAD}</p>`,
    '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px">',
    `<span style="font-weight:700;font-size:1.8rem;letter-spacing:.4rem">${code}</span>`,
    '</div>',
    `<p style="color:#888;font-size:.8rem;margin:0">${IGNORE}</p>`,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
  return {
    to,
    subject: SUBJECT,
    html,
    text: [SUBJECT, '', LEAD, '', code, '', IGNORE].join('\n'),
  };
}
