import { emailAddress, LOGIN_CODE_TTL_MINUTES } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { deletionCodeMail } from './deletion-code-mail';
import { emailChangeCodeMail } from './email-change-code-mail';
import { emailChangedNoticeMail } from './email-changed-notice-mail';

const TO = unwrap(emailAddress('jonas@example.lt'));
const NEW = unwrap(emailAddress('naujas@example.lt'));
const TTL = String(LOGIN_CODE_TTL_MINUTES);

// sportbet's AccountDeletionCodeMail, EmailChangeCodeMail and
// EmailChangedNoticeMail (issue 289, #43), in the code-mail frame.
describe('deletionCodeMail', () => {
  const mail = deletionCodeMail(TO, '01234567');
  it("carries sportbet's subject and lines, the code once and the lifetime", () => {
    expect(mail.to).toBe('jonas@example.lt');
    expect(mail.subject).toBe('Paskyros ištrynimo patvirtinimo kodas');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain(
        `Įveskite šį kodą, kad patvirtintumėte paskyros ištrynimą. Kodas galioja ${TTL} min.`,
      );
      expect(part).toContain(
        'Jei neprašėte ištrinti paskyros, ignoruokite šį laišką - paskyra nebus ištrinta. Šiuo kodu prisijungti negalima.',
      );
      expect(part.split('01234567')).toHaveLength(2);
    }
  });
});

describe('emailChangeCodeMail', () => {
  const mail = emailChangeCodeMail(NEW, '76543210');
  it("carries sportbet's subject and lines, the code once and the lifetime, to the new address", () => {
    expect(mail.to).toBe('naujas@example.lt');
    expect(mail.subject).toBe('El. pašto keitimo patvirtinimo kodas');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain(
        `Įveskite šį kodą, kad šis adresas taptų jūsų paskyros el. paštu. Kodas galioja ${TTL} min.`,
      );
      expect(part).toContain(
        'Jei neprašėte keisti el. pašto, ignoruokite šį laišką - paskyra liks su senuoju adresu. Šiuo kodu prisijungti negalima.',
      );
      expect(part.split('76543210')).toHaveLength(2);
    }
  });
});

describe('emailChangedNoticeMail', () => {
  const mail = emailChangedNoticeMail(TO, NEW);
  it('goes to the old address, names the new one, and holds no code and no link', () => {
    expect(mail.to).toBe('jonas@example.lt');
    expect(mail.subject).toBe('Jūsų paskyros el. paštas pakeistas');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain(
        'Paskyros, kuri naudojo šį adresą, el. paštas pakeistas į naujas@example.lt. Prisijungimo kodai nuo šiol siunčiami ten.',
      );
      expect(part).toContain('Naujas adresas');
      expect(part).toContain(
        'Jei to nedarėte, susisiekite su mumis nedelsdami - paskyrą dar galima susigrąžinti.',
      );
      expect(part).not.toMatch(/\d{8}/);
    }
    expect(mail.html).not.toContain('<a ');
    expect(mail.html).not.toContain('href');
    expect(mail.text).not.toContain('http');
  });
});
