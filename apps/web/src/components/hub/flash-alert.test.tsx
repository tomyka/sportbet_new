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
  ] as const)('flash: %s is an error saying %s', (message, text) => {
    render(<FlashAlert flash={{ kind: 'league', message }} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(text);
    expect(alert.className).toContain('border-bad bg-bad-tint text-bad');
  });
});
