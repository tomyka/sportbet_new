import { describe, expect, it } from 'vitest';
import { gameLine, PLAYED_LINE } from '../../../tests/support/dashboard';
import { gameRowOf } from './game-row';

/** Whether a value holds only what a server component may pass to a client one. */
function plain(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(plain);
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(plain)
  );
}

describe('gameRowOf: a game page line in strings', () => {
  it("holds only plain values, so it can reach the client components (a line's points are classes)", () => {
    expect(plain(PLAYED_LINE)).toBe(false);
    expect(plain(gameRowOf(PLAYED_LINE))).toBe(true);
    expect(plain(gameRowOf(gameLine()))).toBe(true);
  });

  it('a played line: its day and time in Vilnius, the result, the prediction, its points and no odds', () => {
    const row = gameRowOf(PLAYED_LINE);
    expect(row).toMatchObject({
      day: 'Spa 18',
      time: '19:00',
      result: '88:79',
      predicted: '85:80',
      odds: null,
      open: false,
      predict: false,
    });
    expect(row.points?.total).toBe('14.5');
  });

  it('an open line: "?" for a blank side, odds only once both sides are in', () => {
    expect(gameRowOf(gameLine())).toMatchObject({
      predictedHome: '?',
      predictedAway: '?',
      odds: null,
      open: true,
      predict: true,
    });
    expect(
      gameRowOf(gameLine({ predicted: { home: 81, away: 77 } })).odds,
    ).toEqual({ home: '50.0', away: '150.0' });
  });
});
