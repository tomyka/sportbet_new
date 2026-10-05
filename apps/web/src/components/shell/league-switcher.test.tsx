import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueSwitcher } from './league-switcher';
import type { ShellLeagues } from './shell-view';

// sportbet's partials/league-switcher (rail) and partials/bottom-nav (tab):
// the player's leagues in membership order, the active one wherever it
// falls; "Lyga" when none is active.

const LEAGUES: ShellLeagues = {
  items: [
    { id: 7, name: 'Draugai', active: false },
    { id: 3, name: 'Vieša', active: true },
    { id: 9, name: 'Darbas', active: false },
  ],
};

const NONE_ACTIVE: ShellLeagues = {
  items: LEAGUES.items.map((league) => ({ ...league, active: false })),
};

const toggle = (name = 'Vieša') => screen.getByRole('button', { name });
const listed = () =>
  screen.getAllByRole('listitem').map((item) => item.textContent);

describe('LeagueSwitcher in the rail', () => {
  it('shows the active league, closed', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('opens on a click, listing every league in order, the active one ticked where it falls', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(listed()).toEqual(['Draugai', 'Vieša', 'Darbas']);
    const active = screen.getByText('Vieša', {
      selector: '[aria-current="true"]',
    });
    expect(active.querySelector('[data-icon="check2"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-icon="check2"]')).toHaveLength(1);
  });

  it("switches by posting the league's id to /leagues/switch", () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    const button = screen.getByRole('button', { name: 'Draugai' });
    expect(button.getAttribute('type')).toBe('submit');
    const form = button.closest('form');
    expect(form?.getAttribute('action')).toBe('/leagues/switch');
    expect(form?.getAttribute('method')).toBe('post');
    expect(
      form?.querySelector('input[name="leagueID"]')?.getAttribute('value'),
    ).toBe('7');
  });

  it('says "Lyga" with no active league, and lists every league with none ticked', () => {
    render(<LeagueSwitcher leagues={NONE_ACTIVE} variant="rail" />);
    fireEvent.click(toggle('Lyga'));
    expect(listed()).toEqual(['Draugai', 'Vieša', 'Darbas']);
    expect(document.querySelector('[aria-current]')).toBeNull();
    expect(document.querySelector('[data-icon="check2"]')).toBeNull();
    expect(screen.queryByText('Lyga', { selector: 'li *' })).toBeNull();
  });

  it('counts the pending invites on its toggle, as sportbet does', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" invites={2} />);
    const count = screen.getByRole('button', { name: 'Vieša 2' });
    expect(count.querySelector('[data-invites]')?.textContent).toBe('2');
  });

  it('shows no count without pending invites', () => {
    const { container } = render(
      <LeagueSwitcher leagues={LEAGUES} variant="rail" invites={0} />,
    );
    expect(container.querySelector('[data-invites]')).toBeNull();
  });

  it('closes on Escape', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('closes on a click outside it', () => {
    render(<LeagueSwitcher leagues={LEAGUES} variant="rail" />);
    fireEvent.click(toggle());
    fireEvent.click(document.body);
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('LeagueSwitcher as a bottom tab', () => {
  it('drops up the leagues other than the active one, under a trophy', () => {
    const { container } = render(
      <LeagueSwitcher leagues={LEAGUES} variant="tab" />,
    );
    expect(container.querySelector('[data-icon="trophy"]')).not.toBeNull();
    fireEvent.click(toggle());
    expect(listed()).toEqual(['Draugai', 'Darbas']);
  });

  it('says "Lyga" with no active league, and drops up every league', () => {
    render(<LeagueSwitcher leagues={NONE_ACTIVE} variant="tab" />);
    fireEvent.click(toggle('Lyga'));
    expect(listed()).toEqual(['Draugai', 'Vieša', 'Darbas']);
  });
});
