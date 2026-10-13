import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { survivalSaveLimits } from './save-throttle';

// Security hardening (the lead's decision, slice 10): sportbet has no
// throttle on survival saves; one click is one save.

describe('survivalSaveLimits', () => {
  it('throttle: 60 survival saves a minute per player', () => {
    expect(survivalSaveLimits(player('7'))).toEqual([
      { key: 'survival-save:player:7', maxAttempts: 60, windowSeconds: 60 },
    ]);
  });

  it('throttle: each player has their own survival window', () => {
    expect(survivalSaveLimits(player('7'))[0]?.key).not.toBe(
      survivalSaveLimits(player('8'))[0]?.key,
    );
  });
});
