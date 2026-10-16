import { describe, expect, it } from 'vitest';
import { pointsOfHundredths, Points } from '../points/points';
import { isFullyCorrect, SERIJA_STEP, serijaBonus } from './serija';

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

// The serija table of /rules (slice 18, #35, R-106): serijaBonus is walkSerija's
// per-game bonus, split out so the page reads the same step.
describe('serijaBonus', () => {
  it('the first game of a run adds nothing', () => {
    expect(serijaBonus(1, 1).hundredths).toBe(0);
  });

  it('each later call adds 5 (step 5, sportbet 2871bb3) times the rate', () => {
    expect(serijaBonus(2, 1).hundredths).toBe(500);
    expect(serijaBonus(3, 1).hundredths).toBe(1_000);
    expect(serijaBonus(3, 2).hundredths).toBe(2_000);
  });

  it('a run of none adds nothing, never below zero', () => {
    expect(serijaBonus(0, 3).hundredths).toBe(0);
  });

  it('SERIJA_STEP is 5', () => {
    expect(SERIJA_STEP).toBe(5);
  });
});
