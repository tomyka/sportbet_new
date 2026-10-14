import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { leagueSearchLimits } from './search-throttle';

describe('leagueSearchLimits', () => {
  it('is 30 a minute per player', () => {
    expect(leagueSearchLimits(player('7'))).toEqual([
      { key: 'league-search:player:7', maxAttempts: 30, windowSeconds: 60 },
    ]);
  });

  it('keeps each player to their own key', () => {
    expect(leagueSearchLimits(player('8'))[0]?.key).not.toBe(
      leagueSearchLimits(player('7'))[0]?.key,
    );
  });
});
