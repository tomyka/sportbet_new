import { instantFrom, type Instant } from './instant';
import { ok, refuse, type Result } from './result';

const TYPED_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

/** Vilnius is UTC+2 in winter and UTC+3 in summer: the only two offsets to try. */
const VILNIUS_OFFSETS_HOURS = [2, 3] as const;

const HOUR_MS = 3_600_000;

const VILNIUS_WALL_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vilnius',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The wall clock Vilnius shows at `ms`, as `YYYY-MM-DDTHH:mm`. */
function vilniusWallClock(ms: number): string {
  const parts = new Map(
    VILNIUS_WALL_CLOCK.formatToParts(ms).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.get(type) ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** The typed text as a calendar time, or null when it is no real date and time. */
function calendarMs(text: string): number | null {
  const match = TYPED_TIME.exec(text);
  if (match === null) return null;
  const ms = Date.parse(`${text}:00Z`);
  // Date.parse rolls a calendar-invalid time into the next one (February 30,
  // hour 24), so compare the canonical form with what was typed.
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 16) !== text
    ? null
    : ms;
}

export type VilniusTimeRefusal =
  'bad-time' | 'nonexistent-time' | 'ambiguous-time';

/**
 * R-91: a `YYYY-MM-DDTHH:mm` typed on the admin's form, read as Vilnius
 * time. A time the spring change skips, or the autumn change repeats, is
 * refused rather than guessed (sportbet's Carbon::parse picks one).
 */
export function vilniusTipOff(
  text: string,
): Result<Instant, VilniusTimeRefusal> {
  const wall = calendarMs(text);
  if (wall === null) return refuse('bad-time');
  // Each offset that reads back as the typed wall clock is a real reading.
  const readings = VILNIUS_OFFSETS_HOURS.map(
    (hours) => wall - hours * HOUR_MS,
  ).filter((utc) => vilniusWallClock(utc) === text);
  const [only, ...others] = readings;
  if (only === undefined) return refuse('nonexistent-time');
  if (others.length > 0) return refuse('ambiguous-time');
  const instant = instantFrom(`${new Date(only).toISOString().slice(0, 19)}Z`);
  if (!instant.ok) {
    throw new Error('vilniusTipOff: a checked time is not an instant');
  }
  return ok(instant.value);
}

/** The UTC time shown under the box before saving: `YYYY-MM-DD HH:mm UTC`. */
export function utcPreview(at: Instant): string {
  return `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
