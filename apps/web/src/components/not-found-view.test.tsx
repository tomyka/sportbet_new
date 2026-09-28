import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { NotFoundView } from './not-found-view';

it('shows a heading and a way back to the list', () => {
  render(<NotFoundView />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Not found' }),
  ).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'All tournaments' }).getAttribute('href'),
  ).toBe('/');
});
