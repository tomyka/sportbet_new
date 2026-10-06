import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { predictionSaveLimits } from './save-throttle';

// Security hardening (the lead's decision, slice 6): sportbet has no
// throttle on prediction saves.

describe('predictionSaveLimits', () => {
  it('throttle: 60 saves a minute per player', () => {
    expect(predictionSaveLimits(player('7'))).toEqual([
      {
        key: 'prediction-save:player:7',
        maxAttempts: 60,
        windowSeconds: 60,
      },
    ]);
  });

  it('throttle: each player has their own window', () => {
    expect(predictionSaveLimits(player('7'))[0]?.key).not.toBe(
      predictionSaveLimits(player('8'))[0]?.key,
    );
  });
});
