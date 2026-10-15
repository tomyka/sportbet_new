import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_MESSAGES,
  type AdminMessage,
} from '../../server/admin/admin-messages';
import { flashSchema } from '../../server/flash';
import { AdminAlert, problemLine } from './admin-alert';

// sportbet's session('info') and session('error') on the admin pages, and
// its $errors->all() list.

const TEXTS: Readonly<Record<AdminMessage, string>> = {
  'game-added': 'Žaidimas #412 pridėtas.',
  'game-updated': 'Žaidimas #412 atnaujintas.',
  'game-deleted': 'Žaidimas #412 ištrintas.',
  'round-added': 'Turas pridėtas.',
  'round-updated': 'Turas atnaujintas.',
  'round-deleted': 'Turas ištrintas.',
  'teams-updated': 'Komandos atnaujintos.',
  'teams-added': 'Pridėta komandų: 412.',
  'team-renamed': 'Komanda atnaujinta',
  'tournament-created': 'Turnyras sukurtas.',
  'tournament-updated': 'Turnyras atnaujintas.',
  'context-chosen': 'Turnyro kontekstas: Euroleague 2026/27',
  'no-tournament':
    'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
  'tournament-finished': 'Turnyras baigtas - keisti negalima.',
  'duplicate-number': 'Turas su tokia diena šiame turnyre jau yra.',
  'unknown-round': 'Tokio turo šiame turnyre nėra.',
  'has-games': 'Turo, kuriame yra rungtynių, ištrinti negalima.',
  'has-picks': 'Turo, kurį jau pasirinko išlikimo žaidėjai, ištrinti negalima.',
  'mixed-tournament': 'Komanda ir turas priklauso skirtingiems turnyrams.',
  'same-team-twice': 'Šeimininkai ir svečiai turi būti skirtingos komandos.',
  'duplicate-pair': 'Šiame ture šios komandos jau žaidžia viena su kita.',
  'teams-fixed':
    'Pradėtų rungtynių, kurias jau spėjo žaidėjai, komandų keisti negalima.',
  'has-real-predictions':
    'Šių rungtynių ištrinti negalima: jos jau turi spėjimų.',
  'has-result': 'Šių rungtynių ištrinti negalima: jos jau turi rezultatą.',
  'no-game': 'Tokių rungtynių nėra.',
  'teams-exist': 'Šiame turnyre komandos jau yra.',
  'places-incomplete':
    'Galutinė lentelė galima tik užpildžius visas vietas 1..412 be pasikartojimų.',
  'unmark-not-allowed':
    'Galutinės lentelės žymą gali nuimti tik superadministratorius.',
  'unknown-team': 'Tokios komandos šiame turnyre nėra.',
  'duplicate-team': 'Ta pati komanda pateikta kelis kartus.',
  'place-not-positive': 'Vieta turi būti ne mažesnė už 1.',
  'duplicate-place': 'Dvi komandos negali turėti tos pačios vietos.',
  'final-place-out-of-range': 'Finalo vieta gali būti tik 1 arba 2.',
  'duplicate-final-place':
    'Dvi komandos negali turėti tos pačios finalo vietos.',
  'slug-taken': 'Toks slug jau užimtas.',
  'wrong-code': 'Neteisingas arba pasibaigęs kodas.',
  'nothing-to-confirm':
    'Nėra veiksmo, kurį reikėtų patvirtinti. Pradėkite iš naujo.',
};

describe('AdminAlert: the messages', () => {
  it.each(Object.entries(TEXTS))(
    'admin: %s says its text, as a status when it is good news and an alert when it is not',
    (key, text) => {
      const flash = flashSchema.parse({
        kind: 'admin',
        message: key,
        number: 412,
        name: 'Euroleague 2026/27',
      });
      if (flash.kind !== 'admin') throw new Error('not an admin message');
      render(<AdminAlert flash={flash} />);
      const role =
        ADMIN_MESSAGES[flash.message] === 'info' ? 'status' : 'alert';
      expect(screen.getByRole(role).textContent).toBe(text);
    },
  );

  it('admin: every message the app has is covered by a text here', () => {
    expect(Object.keys(TEXTS).sort()).toEqual(
      Object.keys(ADMIN_MESSAGES).sort(),
    );
  });
});

describe("AdminAlert: a refused form (Laravel's $errors->all())", () => {
  it('admin: lists every refused field, each under its sportbet label', () => {
    render(
      <AdminAlert
        flash={{
          kind: 'admin-invalid',
          problems: [
            { field: 'event', problem: 'required' },
            { field: 'eventDay', problem: 'not-an-integer' },
            { field: 'rate', problem: 'above-maximum' },
          ],
        }}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Turo pavadinimas: privalomas laukas',
      'Turo diena: turi būti sveikasis skaičius',
      'Koeficientas: per didelė reikšmė',
    ]);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it.each([
    [
      { field: 'gameDateTime', problem: 'bad-time' },
      'Data ir laikas: neteisingas laikas',
    ],
    [
      { field: 'gameDateTime', problem: 'nonexistent-time' },
      'Šis laikas Vilniuje neegzistuoja (laikrodžio persukimas).',
    ],
    [
      { field: 'gameDateTime', problem: 'ambiguous-time' },
      'Šis laikas Vilniuje dviprasmiškas (laikrodžio persukimas).',
    ],
    [
      { field: 'survival_game', problem: 'survival-with-draws' },
      'Išlikimo žaidimas galimas tik turnyrams be lygiųjų.',
    ],
    [
      { field: 'place', problem: 'bad-place', row: 2 },
      'Eilutė 3: Vieta: turi būti sveikasis skaičius nuo 1',
    ],
    [
      { field: 'finalPlace', problem: 'bad-final-place', row: 0 },
      'Eilutė 1: Finalo vieta: turi būti tuščia, 1 arba 2',
    ],
    [
      { field: 'end_date', problem: 'before-start' },
      'Pabaiga: pabaigos data negali būti ankstesnė už pradžios',
    ],
    [
      { field: 'slug', problem: 'bad-slug' },
      'Slug (URL): leidžiamos tik mažosios raidės a-z, skaitmenys ir brūkšnelis',
    ],
    [
      { field: 'teamCount', problem: 'below-minimum' },
      'Komandų kiekis: per maža reikšmė',
    ],
  ])('admin: %o reads "%s"', (problem, line) => {
    expect(problemLine(problem)).toBe(line);
  });

  it('admin: a field or problem this page has no word for is shown as it is, never dropped', () => {
    expect(problemLine({ field: 'odd', problem: 'strange' })).toBe(
      'odd: strange',
    );
  });
});
