import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EUROLEAGUE_2026_27, storedAs } from '../../tests/support/tournaments';
import { TournamentDetails } from './tournament-details';

it('shows the name, the format and a way back to the list', () => {
  render(<TournamentDetails tournament={storedAs(1, EUROLEAGUE_2026_27)} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Euroleague 2026/27' }),
  ).toBeDefined();
  expect(screen.getByText('Format: Euroleague')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'All tournaments' }).getAttribute('href'),
  ).toBe('/');
});
