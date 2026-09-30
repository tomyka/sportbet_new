import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EUROLEAGUE_2026_27, storedAs } from '../../tests/support/tournaments';
import { HomeView } from './home-view';

it('shows a heading and the tournament list', () => {
  render(<HomeView tournaments={[storedAs(1, EUROLEAGUE_2026_27)]} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tournaments' }),
  ).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Euroleague 2026/27' }),
  ).toBeDefined();
});
