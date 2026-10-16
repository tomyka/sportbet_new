import { describe, expect, it } from 'vitest';
import { at, gameNo, player } from '../testing';
import { dueReminders, type ReminderCandidate } from './due-reminders';

const candidate = (
  who: string,
  game: number,
  tipOff: string,
): ReminderCandidate => ({
  player: player(who),
  game: gameNo(game),
  tipOff: at(tipOff),
});

/** 2026-10-10 is summer time in Vilnius (UTC+3): 16:00Z is 19:00 there. */
const EVENING_GAME = candidate('ann', 1, '2026-10-10T16:00:00Z');

describe('dueReminders', () => {
  it('sends nothing before the trigger game reminder time', () => {
    expect(dueReminders([EVENING_GAME], at('2026-10-10T14:59:59Z'))).toEqual(
      [],
    );
  });

  it('is due at exactly the reminder time (18:00 Vilnius)', () => {
    expect(dueReminders([EVENING_GAME], at('2026-10-10T15:00:00Z'))).toEqual([
      { player: EVENING_GAME.player, games: [EVENING_GAME] },
    ]);
  });

  it('is one entry per player, listing the trigger day only', () => {
    const second = candidate('ann', 2, '2026-10-10T17:30:00Z');
    const nextDay = candidate('ann', 3, '2026-10-11T16:00:00Z');
    const due = dueReminders(
      [EVENING_GAME, second, nextDay],
      at('2026-10-10T15:00:00Z'),
    );
    expect(due).toEqual([
      { player: EVENING_GAME.player, games: [EVENING_GAME, second] },
    ]);
  });

  it('draws the day in Vilnius, not UTC', () => {
    // 21:30Z is 00:30 on the 11th in Vilnius: another day from the 20:30Z game.
    const lateEvening = candidate('ann', 1, '2026-10-10T20:30:00Z');
    const afterMidnight = candidate('ann', 2, '2026-10-10T21:30:00Z');
    const due = dueReminders(
      [lateEvening, afterMidnight],
      at('2026-10-10T18:00:00Z'),
    );
    expect(due).toEqual([{ player: lateEvening.player, games: [lateEvening] }]);
  });

  it('lets a next-day game wait for its own trigger', () => {
    const nextDay = candidate('ann', 3, '2026-10-11T16:00:00Z');
    expect(dueReminders([nextDay], at('2026-10-10T15:00:00Z'))).toEqual([]);
    expect(dueReminders([nextDay], at('2026-10-11T15:00:00Z'))).toEqual([
      { player: nextDay.player, games: [nextDay] },
    ]);
  });

  it('sorts candidates handed over out of order, by tip-off then game id', () => {
    const late = candidate('ann', 5, '2026-10-10T17:00:00Z');
    const tiedHigh = candidate('ann', 9, '2026-10-10T16:00:00Z');
    const tiedLow = candidate('ann', 4, '2026-10-10T16:00:00Z');
    const due = dueReminders(
      [late, tiedHigh, tiedLow],
      at('2026-10-10T15:00:00Z'),
    );
    expect(due[0]?.games).toEqual([tiedLow, tiedHigh, late]);
  });

  it('judges two players apart', () => {
    const early = candidate('ann', 1, '2026-10-10T16:00:00Z');
    const later = candidate('bob', 2, '2026-10-10T18:00:00Z');
    expect(dueReminders([later, early], at('2026-10-10T15:00:00Z'))).toEqual([
      { player: early.player, games: [early] },
    ]);
    expect(
      dueReminders([later, early], at('2026-10-10T17:00:00Z')).map(
        (due) => due.player,
      ),
    ).toEqual([early.player, later.player]);
  });

  it('triggers on the earliest game even when a later one is due sooner in wall time', () => {
    // The 23:30 game's reminder is 21:00, the 00:30 next-day game's is 21:00 the
    // evening before: the earliest candidate decides the day.
    const lateNight = candidate('ann', 1, '2026-10-10T20:30:00Z');
    expect(dueReminders([lateNight], at('2026-10-10T17:59:59Z'))).toEqual([]);
    expect(dueReminders([lateNight], at('2026-10-10T18:00:00Z'))).toHaveLength(
      1,
    );
  });

  it('lists nobody when there are no candidates', () => {
    expect(dueReminders([], at('2026-10-10T15:00:00Z'))).toEqual([]);
  });
});
