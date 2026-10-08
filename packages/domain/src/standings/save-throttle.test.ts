import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { standingsSaveLimits } from './save-throttle';

// Security hardening (the lead's decision, slice 9): sportbet has no
// throttle on standings saves.

describe('standingsSaveLimits', () => {
  it('throttle: 120 saves a minute per player, the row save and the reorder together', () => {
    expect(standingsSaveLimits(player('7'))).toEqual([
      {
        key: 'standings-save:player:7',
        maxAttempts: 120,
        windowSeconds: 60,
      },
    ]);
  });

  it('throttle: each player has their own window', () => {
    expect(standingsSaveLimits(player('7'))[0]?.key).not.toBe(
      standingsSaveLimits(player('8'))[0]?.key,
    );
  });
});
