import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { refuse } from '../shared/result';
import { at, makeGame, score, team, unwrap } from '../testing';

// Zalgiris - Olympiacos, 2026-10-02 18:00 UTC (21:00 in Vilnius).
const zalOly = makeGame({
  id: 1,
  round: 1,
  home: 'ZAL',
  away: 'OLY',
  tipOff: '2026-10-02T18:00:00Z',
});

describe('LR-1', () => {
  it('lock: a game is open one second before tip-off', () => {
    expect(zalOly.isOpenAt(at('2026-10-02T17:59:59Z'))).toBe(true);
  });

  it('lock: a game is closed at the exact tip-off second', () => {
    expect(zalOly.isOpenAt(at('2026-10-02T18:00:00Z'))).toBe(false);
  });

  it('lock: a game with a result is closed before its tip-off', () => {
    const scored = unwrap(zalOly.withResult(score(88, 79), ruledRules));
    expect(scored.isOpenAt(at('2026-10-02T16:00:00Z'))).toBe(false);
  });
});

// Baskonia - Partizan, 2026-11-13 18:00, postponed to 2026-12-10 18:00.
const basPar = makeGame({
  id: 2,
  round: 8,
  home: 'BAS',
  away: 'PAR',
  tipOff: '2026-11-13T18:00:00Z',
});
const newDate = at('2026-12-10T18:00:00Z');
const beforeNewDate = at('2026-12-01T12:00:00Z');

describe('LR-2', () => {
  it('lock (ruled): a game moved after its tip-off stays closed', () => {
    const moved = basPar.reschedule(
      newDate,
      at('2026-11-13T18:30:00Z'),
      ruledRules,
    );
    expect(moved.tipOff).toBe(newDate);
    expect(moved.isOpenAt(beforeNewDate)).toBe(false);
  });

  it.each([
    ['sportbet', sportbetRules],
    ['ruled', ruledRules],
  ] as const)(
    'lock: a game moved before its tip-off reopens (%s)',
    (_, rules) => {
      const moved = basPar.reschedule(
        newDate,
        at('2026-11-12T12:00:00Z'),
        rules,
      );
      expect(moved.isOpenAt(beforeNewDate)).toBe(true);
      expect(moved.isOpenAt(newDate)).toBe(false);
    },
  );

  it('lock (sportbet): a moved game reopens by the new date', () => {
    const moved = basPar.reschedule(
      newDate,
      at('2026-11-13T18:30:00Z'),
      sportbetRules,
    );
    expect(moved.isOpenAt(beforeNewDate)).toBe(true);
  });
});

describe('MS-10 and R-38: a level result', () => {
  it('game (ruled): a level result is refused', () => {
    expect(zalOly.withResult(score(81, 81), ruledRules)).toEqual(
      refuse('level-result'),
    );
  });

  it('game (sportbet): a level result is saved, as the admin typed it', () => {
    const scored = unwrap(zalOly.withResult(score(81, 81), sportbetRules));
    expect(scored.result?.isLevel()).toBe(true);
    expect(scored.winner()).toBeNull();
  });

  it('game: a recorded winner must play in the game', () => {
    expect(
      zalOly.withResult(score(81, 81), sportbetRules, team('REA')),
    ).toEqual(refuse('winner-not-in-game'));
  });

  it('game: clearing a result leaves the game unscored', () => {
    const scored = unwrap(zalOly.withResult(score(88, 79), ruledRules));
    expect(scored.withoutResult().result).toBeNull();
    expect(scored.winner()).toBe(team('ZAL'));
  });
});

describe('R-41: a postponed game', () => {
  // Baskonia - Partizan (11-13 18:00) is postponed with no new date yet.
  const nov12 = at('2026-11-12T12:00:00Z');
  const halfTime = at('2026-11-13T18:30:00Z');

  it.each([
    ['sportbet', sportbetRules],
    ['ruled', ruledRules],
  ] as const)(
    'game: a postponed game has no result, is never open and has not tipped off (%s)',
    (_, rules) => {
      const postponed = unwrap(basPar.postpone(nov12, rules));
      expect(postponed.postponed).toBe(true);
      expect(postponed.result).toBeNull();
      expect(postponed.isOpenAt(nov12)).toBe(false);
      expect(postponed.hasTippedOffAt(at('2026-11-20T12:00:00Z'))).toBe(false);
    },
  );

  it.each([
    ['sportbet', sportbetRules],
    ['ruled', ruledRules],
  ] as const)(
    'game: postponed before tip-off, it reopens when given a new date (%s)',
    (_, rules) => {
      const postponed = unwrap(basPar.postpone(nov12, rules));
      const moved = postponed.reschedule(newDate, beforeNewDate, rules);
      expect(moved.postponed).toBe(false);
      expect(moved.isOpenAt(beforeNewDate)).toBe(true);
      expect(moved.hasTippedOffAt(newDate)).toBe(true);
    },
  );

  it('game (ruled): postponed after tip-off, it stays locked with its new date (R-13)', () => {
    const postponed = unwrap(basPar.postpone(halfTime, ruledRules));
    expect(postponed.hasTippedOffAt(halfTime)).toBe(true);
    const moved = postponed.reschedule(newDate, beforeNewDate, ruledRules);
    expect(moved.isOpenAt(beforeNewDate)).toBe(false);
    expect(moved.lockedSince).toBe(basPar.tipOff);
  });

  it('game: a game with a result cannot be postponed', () => {
    const scored = unwrap(basPar.withResult(score(80, 70), ruledRules));
    expect(scored.postpone(halfTime, ruledRules)).toEqual(
      refuse('already-scored'),
    );
  });

  it('game: entering the result of a postponed game ends the postponement', () => {
    const postponed = unwrap(basPar.postpone(nov12, ruledRules));
    const scored = unwrap(postponed.withResult(score(80, 70), ruledRules));
    expect(scored.postponed).toBe(false);
    expect(scored.winner()).toBe(team('BAS'));
  });
});
