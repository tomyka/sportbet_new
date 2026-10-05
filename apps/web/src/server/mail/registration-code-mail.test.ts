import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { registrationCodeMail } from './registration-code-mail';

const TO = unwrap(emailAddress('ruta.naujoke@example.lt'));

// sportbet's RegistrationCodeMail and emails/registration-code.blade.php:
// a mail that says which code it is, and that it signs nobody in.
it("carries sportbet's subject, the code, its lifetime and the line for whoever did not register", () => {
  const mail = registrationCodeMail(TO, '01234567');
  expect(mail.to).toBe('ruta.naujoke@example.lt');
  expect(mail.subject).toBe('Registracijos patvirtinimo kodas');
  for (const part of [mail.html, mail.text]) {
    expect(part).toContain('Registracijos patvirtinimo kodas');
    expect(part).toContain('01234567');
    expect(part).toContain(
      'Įveskite šį kodą registracijos lange, kad užbaigtumėte registraciją. Kodas galioja 5 min.',
    );
    expect(part).toContain(
      'Jei neregistravotės, ignoruokite šį laišką - paskyra nebus sukurta. Šiuo kodu prisijungti negalima.',
    );
  }
  expect(mail.html).toContain('<html lang="lt">');
  expect(mail.html).toContain('background:#1a1a2e');
});

it('refuses anything but an eight-digit code: a programmer error', () => {
  expect(() => registrationCodeMail(TO, '1234')).toThrow(/not an 8-digit code/);
});
