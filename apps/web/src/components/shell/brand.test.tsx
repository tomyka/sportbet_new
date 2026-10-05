import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PhoneBrand, RailBrand } from './brand';

it("the rail's brand leads to the tournaments, with the app's own logo", () => {
  const { container } = render(<RailBrand />);
  expect(
    screen.getByRole('link', { name: 'SportBet' }).getAttribute('href'),
  ).toBe('/');
  expect(container.querySelector('img')?.getAttribute('src')).toContain(
    '%2Fimg%2Flogo.png',
  );
});

it("the phone's brand names itself in the logo's text alternative", () => {
  render(<PhoneBrand />);
  const logo = screen.getByRole('img', { name: 'SportBet' });
  expect(logo.closest('a')?.getAttribute('href')).toBe('/');
});
