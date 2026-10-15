import { describe, expect, it } from 'vitest';
import { readLeagueSegment } from './league-segment';

describe('readLeagueSegment', () => {
  it('reads an id', () => {
    expect(readLeagueSegment('12')).toBe(12);
  });

  it.each(['', 'abc', '0', '-1', '1.5', ' 12', '012', '2147483648'])(
    'reads %j as no league',
    (segment) => {
      expect(readLeagueSegment(segment)).toBeNull();
    },
  );
});
