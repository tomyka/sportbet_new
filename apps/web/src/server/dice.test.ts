import { expect, it } from 'vitest';
import { cryptoDice } from './dice';

// GeneratedScore: random_int(0, die) per roll, random_int(0, 1) per coin.
it('rolls whole numbers from 0 to the die, both ends reached, and flips both ways', () => {
  const rolls = Array.from({ length: 2000 }, () => cryptoDice.roll(17));
  expect(
    rolls.every((roll) => Number.isInteger(roll) && roll >= 0 && roll <= 17),
  ).toBe(true);
  expect(rolls).toContain(0);
  expect(rolls).toContain(17);
  const coins = new Set(Array.from({ length: 200 }, () => cryptoDice.coin()));
  expect(coins).toEqual(new Set([true, false]));
});
