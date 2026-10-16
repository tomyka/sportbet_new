import { describe, expect, it } from 'vitest';
import { STAGE_RATES, statedRates } from './stage';

describe('statedRates (R-10)', () => {
  it("is sportbet's x1 / x2 where the set fixes no rates", () => {
    expect(statedRates(null)).toEqual([1, 2]);
  });

  it('is the distinct required rates in stage order: 1, 2, 3', () => {
    expect(statedRates(STAGE_RATES)).toEqual([1, 2, 3]);
  });

  it('keeps the order of first appearance in the stage order, not numeric order', () => {
    expect(
      statedRates({
        regular: 3,
        'play-in': 3,
        'play-offs': 1,
        'final-four': 2,
        final: 1,
      }),
    ).toEqual([3, 1, 2]);
  });
});
