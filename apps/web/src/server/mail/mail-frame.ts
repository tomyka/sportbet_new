/**
 * The layout sportbet's mails share (emails/login-code.blade.php,
 * emails/registration-code.blade.php, emails/prediction-reminder.blade.php):
 * the dark SportBet header and a white body card. Its colours are the
 * templates' own, inline - no inbox reads the app's tokens
 * (token-guard.test.ts allows them in the mail files only).
 */
export function mailFrame(body: readonly string[]): string {
  return [
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
    ...body,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text as HTML: what an admin typed (a team's name) never opens a tag or leaves an attribute. */
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) => ESCAPES[character] ?? character,
  );
}

/** A callout mail's own three lines: the subject (its heading too), the lead, and the closing line. */
export interface CalloutText {
  readonly subject: string;
  readonly lead: string;
  readonly ignore: string;
}

/** A callout's one big value, set apart (the code of a code mail). */
export const calloutValue = (value: string): string =>
  `<span style="font-weight:700;font-size:1.8rem;letter-spacing:.4rem">${value}</span>`;

/** A small label over a callout's value (the notice's "Naujas adresas"). */
export const calloutLabel = (label: string): string =>
  `<div style="color:#888;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${label}</div>`;

/** A callout's value as a line of its own, under a label. */
export const calloutLine = (value: string): string =>
  `<div style="font-weight:700;font-size:1rem;color:#111">${value}</div>`;

/**
 * The body every mail with one thing to show shares (the code mails'
 * layout, sportbet's emails/login-code.blade.php, and the address-change
 * notice): a heading, the lead, the thing in a grey box, and the closing
 * line, for mailFrame. The text arrives as HTML: whoever passes something
 * typed escapes it (escapeHtml).
 */
export function calloutBody(text: CalloutText, box: string): string[] {
  return [
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${text.subject}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 20px">${text.lead}</p>`,
    '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px">',
    box,
    '</div>',
    `<p style="color:#888;font-size:.8rem;margin:0">${text.ignore}</p>`,
  ];
}
