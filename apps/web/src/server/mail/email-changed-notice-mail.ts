import type { EmailAddress } from '@sportbet/domain';
import type { OutgoingMail } from './mail';
import { escapeHtml, mailFrame } from './mail-frame';

const SUBJECT = 'Jūsų paskyros el. paštas pakeistas';
const NEW_ADDRESS = 'Naujas adresas';
const NOT_YOU =
  'Jei to nedarėte, susisiekite su mumis nedelsdami - paskyrą dar galima susigrąžinti.';

const leadOf = (newAddress: string): string =>
  `Paskyros, kuri naudojo šį adresą, el. paštas pakeistas į ${newAddress}. Prisijungimo kodai nuo šiol siunčiami ten.`;

/**
 * sportbet's EmailChangedNoticeMail (issue 289, R-24): told to the old
 * address once the move has happened, naming the new one. No code and no
 * link - there is nothing in it to phish or to click by mistake. The new
 * address is escaped (the colours are the template's own, inline; the frame
 * is mail-frame.ts).
 */
export function emailChangedNoticeMail(
  to: EmailAddress,
  newAddress: EmailAddress,
): OutgoingMail {
  const html = mailFrame([
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${SUBJECT}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 16px">${escapeHtml(leadOf(newAddress))}</p>`,
    '<div style="background:#f8f8f8;border-radius:8px;padding:14px 18px;margin-bottom:20px">',
    `<div style="color:#888;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${NEW_ADDRESS}</div>`,
    `<div style="font-weight:700;font-size:1rem;color:#111">${escapeHtml(newAddress)}</div>`,
    '</div>',
    `<p style="color:#888;font-size:.8rem;margin:0">${NOT_YOU}</p>`,
  ]);
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
