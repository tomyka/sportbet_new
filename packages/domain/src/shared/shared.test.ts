import { describe, expect, it } from 'vitest';
import { gameId, playerId, roundNumber, teamId } from './ids';
import { instantFrom, secondsAfter } from './instant';
import { ok, refuse } from './result';

describe('Result', () => {
  it('carries an accepted value or a named refusal', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(refuse('level')).toEqual({ ok: false, refusal: 'level' });
  });
});

describe('ids', () => {
  it('accepts a team, a player, a game and a round', () => {
    expect(teamId('ZAL').ok).toBe(true);
    expect(playerId('ada').ok).toBe(true);
    expect(gameId(1).ok).toBe(true);
    expect(roundNumber(38).ok).toBe(true);
  });

  it.each([
    ['an empty team', teamId('')],
    ['an empty player', playerId('')],
    ['a zero game id', gameId(0)],
    ['a fractional round', roundNumber(1.5)],
    ['a negative round', roundNumber(-1)],
  ])('refuses %s', (_, result) => {
    expect(result.ok).toBe(false);
  });
});

describe('instantFrom', () => {
  it('reads a UTC timestamp to the second', () => {
    expect(instantFrom('2026-10-02T18:00:00Z')).toEqual(
      ok(Date.UTC(2026, 9, 2, 18, 0, 0)),
    );
  });

  it.each([
    ['a local time', '2026-10-02T18:00:00'],
    ['an offset', '2026-10-02T21:00:00+03:00'],
    ['a date only', '2026-10-02'],
    ['an impossible date', '2026-13-45T18:00:00Z'],
  ])('refuses %s', (_, iso) => {
    expect(instantFrom(iso)).toEqual(refuse('not-a-utc-timestamp'));
  });

  it('moves by whole seconds', () => {
    const tipOff = instantFrom('2026-10-02T18:00:00Z');
    expect(tipOff.ok && secondsAfter(tipOff.value, -1)).toBe(
      Date.UTC(2026, 9, 2, 17, 59, 59),
    );
  });
});
