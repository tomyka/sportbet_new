import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { codeMail } from './code-mail';

const TO = unwrap(emailAddress('jonas@example.lt'));

// The frame moved to mail-frame.ts for the reminder mail (slice 16): the
// code mails' markup must stay exactly as it was.
it("keeps sportbet's code-mail markup byte for byte", () => {
  const mail = codeMail(TO, '01234567', {
    subject: 'Antraštė',
    lead: 'Pirmoji eilutė.',
    ignore: 'Paskutinė eilutė.',
  });
  expect(mail.html).toBe(
    [
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
      '<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">Antraštė</h2>',
      '<p style="color:#555;font-size:.9rem;margin:0 0 20px">Pirmoji eilutė.</p>',
      '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:20px">',
      '<span style="font-weight:700;font-size:1.8rem;letter-spacing:.4rem">01234567</span>',
      '</div>',
      '<p style="color:#888;font-size:.8rem;margin:0">Paskutinė eilutė.</p>',
      '</div>',
      '</div>',
      '</body>',
      '</html>',
    ].join('\n'),
  );
  expect(mail.text).toBe(
    [
      'Antraštė',
      '',
      'Pirmoji eilutė.',
      '',
      '01234567',
      '',
      'Paskutinė eilutė.',
    ].join('\n'),
  );
});
