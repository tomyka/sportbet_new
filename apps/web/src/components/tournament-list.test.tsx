import type { Tournament } from '@sportbet/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentList } from './tournament-list';

const tournaments: Tournament[] = [
  { id: 1, slug: 'euro-2028', name: 'Euro 2028', format: 'football' },
  {
    id: 2,
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
  },
];

describe('TournamentList', () => {
  it('links each tournament to its page, with its format', () => {
    render(<TournamentList tournaments={tournaments} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const euro = screen.getByRole('link', { name: 'Euro 2028' });
    expect(euro.getAttribute('href')).toBe('/tournament/euro-2028');
    expect(euro.closest('li')?.textContent).toBe('Euro 2028 (Football)');
    const euroleague = screen.getByRole('link', { name: 'Euroleague 2026/27' });
    expect(euroleague.getAttribute('href')).toBe(
      '/tournament/euroleague-2026-27',
    );
    expect(euroleague.closest('li')?.textContent).toBe(
      'Euroleague 2026/27 (Euroleague)',
    );
  });

  it('says so when there are no tournaments', () => {
    render(<TournamentList tournaments={[]} />);

    expect(screen.getByText('No tournaments yet.')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
