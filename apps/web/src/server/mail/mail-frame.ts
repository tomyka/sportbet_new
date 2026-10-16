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
