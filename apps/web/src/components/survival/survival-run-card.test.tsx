import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ledger, TEAM_NAMES } from '../../../tests/support/survival-views';
import { SurvivalRunCard } from './survival-run-card';

describe('SurvivalRunCard ("Tavo serija")', () => {
  it('the heading, its note, and a chip per round: crest, team, ":round turas · +:points"', () => {
    render(
      <SurvivalRunCard
        run={[ledger(1, 3, 'survived', 10), ledger(2, 4, 'survived', 22)]}
        teamNames={TEAM_NAMES}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Tavo serija' })).toBeDefined();
    expect(
      screen.getByText('Atsistatys, jei pasirinkta komanda pralaimės'),
    ).toBeDefined();
    const chips = screen.getAllByTestId('survival-chip');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Real Madrid1 turas · +10',
      'Fenerbahce2 turas · +22',
    ]);
    expect(
      within(chips[0] ?? document.body).getByRole('img', {
        name: 'Real Madrid',
      }),
    ).toBeDefined();
  });

  it('R-12: a pending pick reads ":round turas · dar nežinoma"', () => {
    render(
      <SurvivalRunCard
        run={[ledger(1, 3, 'survived', 10), ledger(2, 4, 'pending', null)]}
        teamNames={TEAM_NAMES}
      />,
    );
    expect(screen.getAllByTestId('survival-chip')[1]?.textContent).toBe(
      'Fenerbahce2 turas · dar nežinoma',
    );
  });
});
