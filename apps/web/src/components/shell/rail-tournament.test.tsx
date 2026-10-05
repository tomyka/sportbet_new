import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RailTournament } from './rail-tournament';

it('names the tournament in full, with the way out of it', () => {
  render(
    <RailTournament
      tournament={{ name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' }}
    />,
  );
  expect(screen.getByText('Turnyras')).toBeDefined();
  expect(screen.getByText('Eurolyga 2026-27')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Keisti turnyrą' }).getAttribute('href'),
  ).toBe('/tournaments/exit');
});
