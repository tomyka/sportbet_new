import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { adminConfirmationMail } from './admin-confirmation-mail';

const TO = unwrap(emailAddress('savininkas@example.lt'));

// R-26 amended: a mail that names the action, says the code signs nobody in,
// and says what to do when nobody asked.
it('names the action, carries the code and its lifetime, and the line for whoever did not ask', () => {
  const mail = adminConfirmationMail(TO, '01234567', 'Ištrinti žaidimą #412');
  expect(mail.to).toBe('savininkas@example.lt');
  expect(mail.subject).toBe('Veiksmo patvirtinimo kodas');
  for (const part of [mail.html, mail.text]) {
    expect(part).toContain('01234567');
    expect(part).toContain(
      'Įveskite šį kodą administravimo puslapyje, kad patvirtintumėte veiksmą: Ištrinti žaidimą #412. Kodas galioja 5 min.',
    );
    expect(part).toContain(
      'Jei šio veiksmo neprašėte, ignoruokite šį laišką - niekas nebus pakeista. Šiuo kodu prisijungti negalima.',
    );
  }
});

it("refuses an action with markup in it: a mail's HTML is not escaped", () => {
  for (const action of ['<b>x</b>', 'a & b', 'say "hi"']) {
    expect(() => adminConfirmationMail(TO, '01234567', action)).toThrow(
      /holds markup/,
    );
  }
});

it('refuses anything but an eight-digit code: a programmer error', () => {
  expect(() => adminConfirmationMail(TO, '1234', 'x')).toThrow(
    /not an 8-digit code/,
  );
});
