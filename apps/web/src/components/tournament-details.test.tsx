import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TournamentDetails } from './tournament-details';

it('shows the name, the format and a way back to the list', () => {
  render(
    <TournamentDetails
      tournament={{
        id: 1,
        slug: 'euro-2028',
        name: 'Euro 2028',
        format: 'football',
      }}
    />,
  );

  expect(
    screen.getByRole('heading', { level: 1, name: 'Euro 2028' }),
  ).toBeDefined();
  expect(screen.getByText('Format: Football')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'All tournaments' }).getAttribute('href'),
  ).toBe('/');
});
