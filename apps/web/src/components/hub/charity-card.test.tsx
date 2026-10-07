import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CharityCard } from './charity-card';

it("charity (R-52): sportbet's card, speaking of basketball, with 7 500€", () => {
  render(<CharityCard />);
  const card = screen.getByTestId('charity-card');
  expect(
    screen.getByRole('heading', { name: 'Žaidžiame dėl gero tikslo' }),
  ).toBeDefined();
  expect(card.textContent).toContain(
    'SportBet - tai ne tik krepšinio prognozių žaidimas.',
  );
  expect(card.textContent).not.toContain('futbolo');
  expect(card.textContent).toContain('Jaunimo linijai');
  expect(card.textContent).toContain('7 500€');
  expect(card.textContent).toContain('paaukota nuo 2018 m.');
  // The charity page is not built yet: no link to it.
  expect(card.querySelector('a')).toBeNull();
});

it("charity: sportbet's amber card (.sb-charity-card), not a plain one", () => {
  render(<CharityCard />);
  const card = screen.getByTestId('charity-card');
  expect(card.className).toContain('bg-warn-tint');
  expect(card.className).toContain('border-warn');
});

it("charity, the leaderboard's card (leaderboard.blade.php): its own shorter text, in basketball too (R-75), and 'Sužinoti daugiau apie labdarą'", () => {
  render(<CharityCard variant="leaderboard" />);
  const card = screen.getByTestId('charity-card');
  expect(card.textContent).toContain(
    'SportBet - tai ne tik krepšinio prognozių žaidimas. Nuo 2018 metų žaidėjai savanoriškai aukoja Jaunimo linijai, teikiančiai psichologinę pagalbą jaunimui visoje Lietuvoje.',
  );
  expect(card.textContent).not.toContain('futbolo');
  expect(card.textContent).not.toContain('TransUnion');
  expect(card.textContent).toContain('Sužinoti daugiau apie labdarą');
  expect(card.textContent).toContain('7 500€');
  // The charity page is not built yet: no link to it.
  expect(card.querySelector('a')).toBeNull();
});
