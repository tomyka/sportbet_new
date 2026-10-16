import { instantSchema, type Instant } from '../shared/instant';
import { vilniusDay } from '../shared/vilnius-day';
import { vilniusTipOff } from '../shared/vilnius-time';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The hour of the Vilnius wall clock, 0-23. */
const VILNIUS_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Vilnius',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** 21:00 Vilnius time on a calendar day (YYYY-MM-DD): never skipped or repeated by a clock change. */
function nineInTheEvening(day: string): Instant {
  const time = vilniusTipOff(`${day}T21:00`);
  if (!time.ok) {
    throw new Error(`reminderTimeOf: 21:00 does not exist on ${day}`);
  }
  return time.value;
}

/** The calendar day before a YYYY-MM-DD. */
function dayBefore(day: string): string {
  const noon = Date.parse(`${day}T12:00:00Z`);
  return new Date(noon - DAY_MS).toISOString().slice(0, 10);
}

/**
 * When a game's reminder is due (sportbet's
 * SendPredictionReminders::computeReminderTime), in Vilnius wall time: a
 * tip-off from 22:00 is reminded at 21:00 that day, one before 08:00 at 21:00
 * the day before, any other an hour before.
 *
 * An hour of elapsed time equals an hour of wall time on the "hour before"
 * branch: it applies only from 08:00 to 21:59, and Vilnius changes its clocks
 * at 03:00 and 04:00, so no change falls between a tip-off and the hour
 * before it. The 21:00 branches are set on the right calendar day instead.
 */
export function reminderTimeOf(tipOff: Instant): Instant {
  const hour = Number(VILNIUS_HOUR.format(tipOff));
  const day = vilniusDay(tipOff);
  if (hour >= 22) return nineInTheEvening(day);
  if (hour < 8) return nineInTheEvening(dayBefore(day));
  return instantSchema.parse(tipOff - HOUR_MS);
}
