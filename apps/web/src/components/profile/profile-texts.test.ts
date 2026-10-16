import { describe, expect, it } from 'vitest';
import type { Flash } from '../../server/flash';
import {
  accountErrorText,
  codeErrorText,
  PROFILE_TEXT,
  refusalTexts,
} from './profile-texts';

describe('accountErrorText', () => {
  it("says what registration's form says, with the owner's two new texts", () => {
    expect(accountErrorText('username', 'required', 1)).toBe(
      'Įveskite vartotojo vardą.',
    );
    expect(accountErrorText('username', 'blank', 1)).toBe(
      'Įveskite vartotojo vardą.',
    );
    expect(accountErrorText('name', 'required', 1)).toBe('Įveskite vardą.');
    expect(accountErrorText('surname', 'required', 1)).toBe(
      'Įveskite pavardę.',
    );
    expect(accountErrorText('email', 'required', 1)).toBe(
      'Įveskite el. pašto adresą.',
    );
    expect(accountErrorText('email', 'not-an-email', 1)).toBe(
      'Įveskite teisingą el. pašto adresą.',
    );
    expect(accountErrorText('surname', 'too-long', 1)).toBe(
      'Per ilgas: daugiausia 255 simboliai.',
    );
    expect(accountErrorText('username', 'taken', 1)).toBe(
      'Šis vartotojo vardas jau užimtas.',
    );
    expect(accountErrorText('email', 'taken', 1)).toBe(
      'Šis el. pašto adresas jau užregistruotas.',
    );
  });

  it("says the address change's send failure and throttle in sportbet's words", () => {
    expect(accountErrorText('email', 'send-failed', 1)).toBe(
      'Nepavyko išsiųsti patvirtinimo kodo. Bandykite vėliau.',
    );
    expect(accountErrorText('email', 'throttled', 4)).toBe(
      'Per daug bandymų. Pabandykite po 4 min.',
    );
  });
});

describe('codeErrorText', () => {
  it('says each refusal of the code box and the danger zone', () => {
    expect(codeErrorText('none')).toBe('Nėra laukiančio el. pašto keitimo.');
    expect(codeErrorText('taken')).toBe(
      'Šis el. paštas jau susietas su kita paskyra.',
    );
    expect(codeErrorText('send-failed')).toBe(PROFILE_TEXT.sendFailed);
    expect(codeErrorText('last-superadmin')).toBe(PROFILE_TEXT.lastSuperadmin);
    expect(codeErrorText('invalid')).toBe(
      'Neteisingas arba pasibaigęs patvirtinimo kodas.',
    );
  });
});

describe('refusalTexts', () => {
  const refused: Flash = {
    kind: 'account-refused',
    errors: { email: 'taken', username: 'required' },
    values: { username: '', name: 'a', surname: 'b', email: 'c@d.lt' },
  };

  it('lists a bag in the order of the form, and no other bag, and nothing for another message', () => {
    expect(refusalTexts(refused, 'account')).toEqual([
      'Įveskite vartotojo vardą.',
      'Šis el. pašto adresas jau užregistruotas.',
    ]);
    expect(refusalTexts(refused, 'emailChange')).toEqual([]);
    expect(refusalTexts(refused, 'userDeletion')).toEqual([]);
    expect(refusalTexts({ kind: 'email-changed' }, 'account')).toEqual([]);
    expect(refusalTexts(null, 'account')).toEqual([]);
  });

  it('defaults a throttled minute count to one when the message carries none', () => {
    expect(
      refusalTexts(
        {
          kind: 'account-refused',
          errors: { email: 'throttled' },
          values: { username: '', name: '', surname: '', email: '' },
        },
        'account',
      ),
    ).toEqual(['Per daug bandymų. Pabandykite po 1 min.']);
  });
});
