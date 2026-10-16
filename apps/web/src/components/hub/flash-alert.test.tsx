import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlashAlert } from './flash-alert';

// sportbet's session('info') and session('error') alerts.

describe('FlashAlert', () => {
  it('flash: a registration done is a success, naming the tournament', () => {
    render(
      <FlashAlert
        flash={{ kind: 'registered', tournament: 'Euroleague 2027/28' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Užsiregistravote į turnyrą: Euroleague 2027/28',
    );
  });

  it.each([
    ['registration-closed', 'Registracija į šį turnyrą jau pasibaigė.'],
    ['confirm-required', 'Patvirtinkite, kad norite dalyvauti šiame turnyre.'],
  ] as const)('flash: %s is an error: %s', (kind, text) => {
    render(<FlashAlert flash={{ kind }} />);
    expect(screen.getByRole('alert').textContent).toBe(text);
  });

  it('flash: a league switched is a success (session info on the game page)', () => {
    render(<FlashAlert flash={{ kind: 'league-switched' }} />);
    expect(screen.getByRole('status').textContent).toBe('Lyga pakeista');
  });

  it("flash: the reminders turned off is a success, sportbet's unsubscribe message (R-98)", () => {
    render(<FlashAlert flash={{ kind: 'reminders-off' }} />);
    expect(screen.getByRole('status').textContent).toBe(
      'Pranešimai išjungti sėkmingai.',
    );
  });

  it('flash: the recalculation done is a status (session info on the admin page)', () => {
    render(<FlashAlert flash={{ kind: 'recalculated' }} />);
    expect(screen.getByRole('status').textContent).toBe(
      'Visi taškų rezultatai perskaičiuoti.',
    );
  });

  it("flash: too many tries is an error with the throttle's own text", () => {
    render(<FlashAlert flash={{ kind: 'throttled', minutes: 2 }} />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Per daug bandymų. Pabandykite dar kartą po 2 min.',
    );
  });
});

describe('FlashAlert: the league page (LeagueController, R-119)', () => {
  it.each([
    ['league-created', 'Lyga sukurta'],
    ['league-updated', 'Lyga atnaujinta'],
    ['invite-sent', 'Kvietimas išsiųstas'],
    ['league-joined', 'Prisijungta prie lygos'],
    ['invite-declined', 'Kvietimas atmestas'],
    ['league-deleted', 'Lyga ištrinta'],
    ['league-left', 'Palikote lygą'],
    ['league-handed-over', 'Lygos valdymas perduotas'],
    ['payments-saved', 'Mokėjimai išsaugoti'],
    ['details-saved', 'Rekvizitai išsaugoti'],
  ] as const)('flash: %s is a success saying %s', (message, text) => {
    render(<FlashAlert flash={{ kind: 'league', message }} />);
    const alert = screen.getByRole('status');
    expect(alert.textContent).toBe(text);
    expect(alert.className).toContain('border-ok bg-ok-tint text-ok');
  });

  it.each([
    [
      'no-tournament',
      'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
    ],
    ['already-member-or-invited', 'Vartotojas jau narys arba pakviestas'],
    [
      'invitee-not-in-tournament',
      'Šis žaidėjas dar neprisijungė prie šio turnyro.',
    ],
    ['join-tournament-first', 'Pirmiausia prisijunkite prie šio turnyro.'],
    ['delete-public', 'Viešos lygos ištrinti negalima'],
    ['leave-public', 'Negalima palikti Bendros lygos'],
    ['leave-owner', 'Perduokite lygos valdymą kitam nariui prieš išeidami'],
    ['leave-only-league', 'Negalima palikti vienintelės lygos'],
    ['transfer-not-owner', 'Lygos valdymą gali perduoti tik jos savininkas'],
    ['transfer-not-a-member', 'Valdymą galima perduoti tik šios lygos nariui'],
    ['transfer-already-owner', 'Jūs jau esate šios lygos savininkas'],
    ['transfer-public', 'Viešos lygos valdymo perduoti negalima'],
    [
      'details-iban-invalid',
      'Neteisingas IBAN - patikrinkite, ar nesuklydote skaitmeniu.',
    ],
    [
      'details-half-pair',
      'Nurodykite ir gavėją, ir sąskaitą - su viena iš jų rekvizitai nerodomi.',
    ],
  ] as const)('flash: %s is an error saying %s', (message, text) => {
    render(<FlashAlert flash={{ kind: 'league', message }} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(text);
    expect(alert.className).toContain('border-bad bg-bad-tint text-bad');
  });
});

describe('FlashAlert: the profile (slice 17)', () => {
  it('shows the profile info messages as statuses', () => {
    render(<FlashAlert flash={{ kind: 'email-changed' }} />);
    expect(screen.getByRole('status').textContent).toBe(
      'El. paštas pakeistas. Apie pakeitimą pranešėme senuoju adresu.',
    );
  });

  it('draws nothing for a refusal: the profile page draws those in its cards', () => {
    const { container } = render(
      <FlashAlert
        flash={{
          kind: 'profile-refused',
          bag: 'userDeletion',
          errors: { code: 'invalid' },
        }}
      />,
    );
    expect(container.textContent).toBe('');
  });
});
