import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TournamentDetails } from './tournament-details';

it('shows the name, the format and a way back to the list', () => {
  render(
    <TournamentDetails
      tournament={{
        id: 1,
        slug: 'euroleague-2026-27',
        name: 'Euroleague 2026/27',
        format: 'euroleague',
        endsOn: '2027-05-23',
        standingsDeadlineRound: null,
        survival: true,
        standingsTableFinal: false,
      }}
    />,
  );

  expect(
    screen.getByRole('heading', { level: 1, name: 'Euroleague 2026/27' }),
  ).toBeDefined();
  expect(screen.getByText('Format: Euroleague')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'All tournaments' }).getAttribute('href'),
  ).toBe('/');
});
