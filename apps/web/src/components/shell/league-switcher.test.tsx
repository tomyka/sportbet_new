import { leagueNo } from '@sportbet/domain/testing';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueSwitcher } from './league-switcher';
import type { ShellLeagues } from './shell-view';

// sportbet's partials/bottom-nav: the leagues other than the active one,
// "Lyga" when none is active. The rail's list is context-switch.test.tsx's.

const LEAGUES: ShellLeagues = {
  items: [
    { id: leagueNo(7), name: 'Draugai', active: false },
    { id: leagueNo(3), name: 'Vieša', active: true },
    { id: leagueNo(9), name: 'Darbas', active: false },
  ],
};

const NONE_ACTIVE: ShellLeagues = {
  items: LEAGUES.items.map((league) => ({ ...league, active: false })),
};

const toggle = (name = 'Vieša') => screen.getByRole('button', { name });
const listed = () =>
  screen.getAllByRole('listitem').map((item) => item.textContent);

describe('LeagueSwitcher as a bottom tab', () => {
  it('drops up the leagues other than the active one, under a trophy', () => {
    const { container } = render(<LeagueSwitcher leagues={LEAGUES} />);
    expect(container.querySelector('[data-icon="trophy"]')).not.toBeNull();
    fireEvent.click(toggle());
    expect(listed()).toEqual(['Draugai', 'Darbas']);
  });

  it('says "Lyga" with no active league, and drops up every league', () => {
    render(<LeagueSwitcher leagues={NONE_ACTIVE} />);
    fireEvent.click(toggle('Lyga'));
    expect(listed()).toEqual(['Draugai', 'Vieša', 'Darbas']);
  });

  it('closes on Escape, on a click outside it and when focus leaves it', () => {
    render(
      <>
        <LeagueSwitcher leagues={LEAGUES} />
        <button type="button">Kita</button>
      </>,
    );
    const closed = () => screen.queryByRole('list') === null;
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed()).toBe(true);
    fireEvent.click(toggle());
    fireEvent.click(document.body);
    expect(closed()).toBe(true);
    fireEvent.click(toggle());
    fireEvent.focusOut(toggle(), {
      relatedTarget: screen.getByRole('button', { name: 'Kita' }),
    });
    expect(closed()).toBe(true);
  });
});
