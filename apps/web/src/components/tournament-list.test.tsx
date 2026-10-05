import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EUROLEAGUE_2025_26,
  EUROLEAGUE_2026_27,
  storedAs,
} from '../../tests/support/tournaments';
import { TournamentList } from './tournament-list';

const tournaments = [
  storedAs(1, EUROLEAGUE_2025_26),
  storedAs(2, EUROLEAGUE_2026_27),
];

describe('TournamentList', () => {
  it('links each tournament to its page, with its format', () => {
    render(<TournamentList tournaments={tournaments} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const euroleagueA = screen.getByRole('link', {
      name: 'Euroleague 2025/26',
    });
    expect(euroleagueA.getAttribute('href')).toBe(
      '/tournament/euroleague-2025-26',
    );
    expect(euroleagueA.closest('li')?.textContent).toBe(
      'Euroleague 2025/26 (Euroleague)',
    );
    const euroleagueB = screen.getByRole('link', {
      name: 'Euroleague 2026/27',
    });
    expect(euroleagueB.getAttribute('href')).toBe(
      '/tournament/euroleague-2026-27',
    );
    expect(euroleagueB.closest('li')?.textContent).toBe(
      'Euroleague 2026/27 (Euroleague)',
    );
  });

  it('says so when there are no tournaments', () => {
    render(<TournamentList tournaments={[]} />);

    expect(screen.getByText('Turnyrų kol kas nėra')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
