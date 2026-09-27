import type { Tournament } from '@sportbet/domain';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HomeView } from './home-view';

it('shows a heading and the tournament list', () => {
  const tournaments: Tournament[] = [
    { id: 1, slug: 'euro-2028', name: 'Euro 2028', format: 'football' },
  ];

  render(<HomeView tournaments={tournaments} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tournaments' }),
  ).toBeDefined();
  expect(screen.getByRole('link', { name: 'Euro 2028' })).toBeDefined();
});
