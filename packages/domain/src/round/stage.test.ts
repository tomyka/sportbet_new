import { describe, expect, it } from 'vitest';
import { statedRates } from './stage';

describe('statedRates (R-10)', () => {
  it('is the distinct required rates in stage order: 1, 2, 3', () => {
    expect(statedRates()).toEqual([1, 2, 3]);
  });
});
