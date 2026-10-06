import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { card, EL_2026 } from '../../../tests/support/hub-cards';
import { HubView } from './hub-view';

const named = (
  id: number,
  name: string,
  group: 'active' | 'upcoming' | 'finished',
) =>
  card({
    tournament: { ...EL_2026, id, slug: `t-${String(id)}`, name },
    group,
  });

describe('HubView', () => {
  it('hub: the charity card, then each group with its heading, in the order given, then the disclaimer', () => {
    render(
      <HubView
        cards={[
          named(1, 'Vykstantis', 'active'),
          named(2, 'Artėjantis', 'upcoming'),
          named(3, 'Pasibaigęs', 'finished'),
        ]}
        flash={null}
      />,
    );
    expect(screen.getByTestId('charity-card')).toBeDefined();
    const groups = ['active', 'upcoming', 'finished'].map((group) =>
      screen.getByTestId(`hub-group-${group}`),
    );
    expect(
      groups.map((group) => group.querySelector('h2')?.textContent),
    ).toEqual([
      expect.stringContaining('Vykstantys turnyrai'),
      expect.stringContaining('Artėjantys turnyrai'),
      expect.stringContaining('Pasibaigę turnyrai'),
    ]);
    expect(
      within(groups[1] ?? document.body).getByText('Artėjantis'),
    ).toBeDefined();
    expect(
      screen.getByText(
        'SportBet yra nemokamas pramoginis žaidimas - realių pinigų lažybų nėra.',
      ),
    ).toBeDefined();
  });

  it('hub: a group with no tournament is not drawn', () => {
    render(<HubView cards={[named(1, 'Vykstantis', 'active')]} flash={null} />);
    expect(screen.queryByTestId('hub-group-upcoming')).toBeNull();
    expect(screen.queryByTestId('hub-group-finished')).toBeNull();
  });

  it('hub: with no tournament at all, the empty state (issue #53)', () => {
    render(<HubView cards={[]} flash={null} />);
    expect(screen.getByText('Turnyrų kol kas nėra')).toBeDefined();
    expect(
      screen.getByText(
        'Kai tik bus paskelbtas naujas turnyras, jis atsiras čia.',
      ),
    ).toBeDefined();
  });

  it('hub: a one-time message above everything', () => {
    render(<HubView cards={[]} flash={{ kind: 'registration-closed' }} />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Registracija į šį turnyrą jau pasibaigė.',
    );
  });

  it('hub: one level-1 heading, for screen readers', () => {
    render(<HubView cards={[]} flash={null} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Turnyrai' }),
    ).toBeDefined();
  });
});
