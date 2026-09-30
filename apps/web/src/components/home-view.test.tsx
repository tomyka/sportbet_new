import type { Tournament } from '@sportbet/domain';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HomeView } from './home-view';

it('shows a heading and the tournament list', () => {
  const tournaments: Tournament[] = [
    {
      id: 1,
      slug: 'euroleague-2026-27',
      name: 'Euroleague 2026/27',
      format: 'euroleague',
      endsOn: '2027-05-23',
      standingsDeadlineRound: null,
      survival: true,
      standingsTableFinal: false,
    },
  ];

  render(<HomeView tournaments={tournaments} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tournaments' }),
  ).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Euroleague 2026/27' }),
  ).toBeDefined();
});
