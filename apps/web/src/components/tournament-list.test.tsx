import type { Tournament } from '@sportbet/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentList } from './tournament-list';

const tournaments: Tournament[] = [
  {
    id: 1,
    slug: 'euroleague-2025-26',
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  {
    id: 2,
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
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

    expect(screen.getByText('No tournaments yet.')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
