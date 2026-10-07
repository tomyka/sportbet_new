import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PhoneBrand, RailBrand } from './brand';

it("the rail's brand leads a guest to the tournaments, with the app's own logo", () => {
  const { container } = render(<RailBrand player={false} />);
  expect(
    screen.getByRole('link', { name: 'SportBet' }).getAttribute('href'),
  ).toBe('/');
  expect(container.querySelector('img')?.getAttribute('src')).toContain(
    '%2Fimg%2Flogo.png',
  );
});

it("the rail's brand leads a player to the game page (partials/rail.blade.php: route('main'))", () => {
  render(<RailBrand player />);
  expect(
    screen.getByRole('link', { name: 'SportBet' }).getAttribute('href'),
  ).toBe('/main');
});

it("the phone's brand names itself in the logo's text alternative, and leads a guest to the tournaments", () => {
  render(<PhoneBrand player={false} />);
  const logo = screen.getByRole('img', { name: 'SportBet' });
  expect(logo.closest('a')?.getAttribute('href')).toBe('/');
});

it("the phone's brand leads a player to the game page (partials/header.blade.php's @auth)", () => {
  render(<PhoneBrand player />);
  const logo = screen.getByRole('img', { name: 'SportBet' });
  expect(logo.closest('a')?.getAttribute('href')).toBe('/main');
});
