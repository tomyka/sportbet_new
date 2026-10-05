import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RailTournament } from './rail-tournament';

it('names the tournament in full, with the way out of it', () => {
  render(
    <RailTournament
      tournament={{ name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' }}
      exitHref="/tournaments/exit"
    />,
  );
  expect(screen.getByText('Turnyras')).toBeDefined();
  expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
  ).toBe('/tournaments/exit');
});

it('offers no way out while that page does not exist', () => {
  render(
    <RailTournament
      tournament={{ name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' }}
      exitHref={null}
    />,
  );
  expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Keisti turnyrą' })).toBeNull();
});
