import { randomInt } from 'node:crypto';
import type { FillInDice } from '@sportbet/domain';

/**
 * The fill-in generator's randomness (FI-2), as sportbet's GeneratedScore
 * draws it: random_int(0, die) for a roll, random_int(0, 1) for the coin
 * that moves a level away side. node:crypto's randomInt is uniform and its
 * upper bound exclusive.
 */
export const cryptoDice: FillInDice = {
  roll: (die) => randomInt(0, die + 1),
  coin: () => randomInt(0, 2) === 1,
};
