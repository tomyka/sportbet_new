import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { loginCodeMail } from './login-code-mail';

const TO = unwrap(emailAddress('jonas@example.lt'));

// sportbet's LoginCodeMail and emails/login-code.blade.php (#76: the
// lifetime is stated from the constant the expiry is set from).
it("carries sportbet's subject, the code, its lifetime and the line for whoever did not ask", () => {
  const mail = loginCodeMail(TO, '01234567');
  expect(mail.to).toBe('jonas@example.lt');
  expect(mail.subject).toBe('Jūsų prisijungimo kodas');
  for (const part of [mail.html, mail.text]) {
    expect(part).toContain('01234567');
    expect(part).toContain(
      'Įveskite šį kodą, kad prisijungtumėte. Kodas galioja 5 min.',
    );
    expect(part).toContain(
      'Jei neprašėte šio kodo, galite ignoruoti šį laišką.',
    );
  }
  expect(mail.html).toContain('<html lang="lt">');
});

it('refuses anything but an eight-digit code: a programmer error', () => {
  expect(() => loginCodeMail(TO, '1234')).toThrow(/not an 8-digit code/);
});
