import type { TournamentPage } from '@sportbet/db';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EL_2026, PROFILE } from '../../../tests/support/hub-cards';
import { TournamentPageView } from './tournament-page-view';

const PAGE: TournamentPage = {
  tournament: EL_2026,
  profile: PROFILE,
  finished: false,
  participants: 42,
  action: 'sign-in',
};

describe("TournamentPageView: show.blade.php's header", () => {
  it('tournament page: the name, the description, sport, year and players, and the way back', () => {
    render(<TournamentPageView page={PAGE} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Euroleague 2026/27' }),
    ).toBeDefined();
    expect(screen.getByText('Eurolygos sezonas')).toBeDefined();
    expect(screen.getByText('Krepšinis · 2026 · 42 dalyviai')).toBeDefined();
    expect(
      screen.getByRole('link', { name: '← Turnyrai' }).getAttribute('href'),
    ).toBe('/');
  });

  it("tournament page: the name is the card's title, as sportbet's .sb-card-title draws it", () => {
    render(<TournamentPageView page={PAGE} />);
    const title = screen.getByRole('heading', { level: 1 }).className;
    expect(title).toContain('uppercase');
    expect(title).toContain('text-muted');
    expect(title).toContain('text-[0.7rem]');
  });

  it('tournament page: a guest is asked to sign in for this tournament', () => {
    render(<TournamentPageView page={PAGE} />);
    expect(
      screen
        .getByRole('link', { name: 'Prisijungti ir dalyvauti' })
        .getAttribute('href'),
    ).toBe('/login?tournament=euroleague-2026-27');
  });

  it('tournament page: a player not in it, while it is open, registers through its form', () => {
    render(<TournamentPageView page={{ ...PAGE, action: 'register' }} />);
    expect(
      screen
        .getByRole('link', { name: 'Registruotis į turnyrą' })
        .getAttribute('href'),
    ).toBe('/tournament/euroleague-2026-27/register');
  });

  it('tournament page: otherwise "Sukurti lygą šiame turnyre", not a link until leagues exist', () => {
    render(<TournamentPageView page={{ ...PAGE, action: 'create-league' }} />);
    expect(
      screen.getByText('Sukurti lygą šiame turnyre').closest('a'),
    ).toBeNull();
  });

  it('tournament page: no start date, no year', () => {
    render(
      <TournamentPageView
        page={{ ...PAGE, profile: { ...PROFILE, startsOn: null } }}
      />,
    );
    expect(screen.getByText('Krepšinis · 42 dalyviai')).toBeDefined();
  });

  it('tournament page: a finished tournament shows only the way back', () => {
    render(<TournamentPageView page={{ ...PAGE, finished: true }} />);
    expect(screen.getByRole('link', { name: '← Turnyrai' })).toBeDefined();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
