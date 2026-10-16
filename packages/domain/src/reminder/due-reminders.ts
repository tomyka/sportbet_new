import type { GameId, PlayerId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { vilniusDay } from '../shared/vilnius-day';
import { reminderTimeOf } from './reminder-time';

/** A game a player has not answered and has not been reminded of. */
export interface ReminderCandidate {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly tipOff: Instant;
}

export interface DueReminder {
  readonly player: PlayerId;
  /** That Vilnius day's candidates, by tip-off then game id. */
  readonly games: readonly ReminderCandidate[];
}

/**
 * How far ahead the candidates are read (sportbet's HORIZON_HOURS). The
 * earliest reminder goes out eleven hours before a 07:59 tip-off and gathers
 * games to the end of that day, so nothing a run sends lies more than 35
 * hours out; two days bounds the read without cutting anything off.
 */
export const REMINDER_HORIZON_HOURS = 48;

function byTipOffThenGame(a: ReminderCandidate, b: ReminderCandidate): number {
  return a.tipOff - b.tipOff || a.game - b.game;
}

function candidatesByPlayer(
  candidates: readonly ReminderCandidate[],
): ReadonlyMap<PlayerId, readonly ReminderCandidate[]> {
  const byPlayer = new Map<PlayerId, ReminderCandidate[]>();
  for (const candidate of [...candidates].sort(byTipOffThenGame)) {
    const own = byPlayer.get(candidate.player) ?? [];
    own.push(candidate);
    byPlayer.set(candidate.player, own);
  }
  return byPlayer;
}

/**
 * Sportbet's reminder rule (issue 230): per player the trigger is the
 * earliest candidate; once its reminder time has been reached, one mail lists
 * every candidate on the trigger's Vilnius calendar day, and a later day waits
 * for its own trigger. Players come in the order of their earliest game.
 */
export function dueReminders(
  candidates: readonly ReminderCandidate[],
  now: Instant,
): readonly DueReminder[] {
  const due: DueReminder[] = [];
  for (const [player, own] of candidatesByPlayer(candidates)) {
    const [trigger] = own;
    if (trigger === undefined || now < reminderTimeOf(trigger.tipOff)) continue;
    const day = vilniusDay(trigger.tipOff);
    due.push({
      player,
      games: own.filter((game) => vilniusDay(game.tipOff) === day),
    });
  }
  return due;
}
