import { describe, expect, it } from 'vitest';
import { pointsOfHundredths, Points } from '../points/points';
import { isFullyCorrect } from './serija';

describe('isFullyCorrect (SerijaCorrectness::isFullyCorrect)', () => {
  const named = pointsOfHundredths(7_950);

  it('a real prediction with winner points above 0 is fully correct', () => {
    expect(isFullyCorrect(named, 'real')).toBe(true);
  });

  it('a fill-in never is, even one that named the winner', () => {
    expect(isFullyCorrect(named, 'fill-in')).toBe(false);
    expect(isFullyCorrect(named, 'late-fill-in')).toBe(false);
  });

  it('no winner points: not correct', () => {
    expect(isFullyCorrect(Points.ZERO, 'real')).toBe(false);
  });

  it('a row with no prediction behind it counts, as sportbet reads a missing `generated` as not generated', () => {
    expect(isFullyCorrect(named, null)).toBe(true);
  });
});
