import { z } from 'zod';
import { ok, refuse, type Result } from './result';

const instantSchema = z.int().brand<'Instant'>();

/**
 * A moment in UTC, as milliseconds since the epoch. Vilnius time is display
 * only (catalogue, conventions), so the domain never sees a time zone.
 */
export type Instant = z.infer<typeof instantSchema>;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** An ISO-8601 UTC timestamp to the second, e.g. `2026-10-02T18:00:00Z`. */
export function instantFrom(
  iso: string,
): Result<Instant, 'not-a-utc-timestamp'> {
  if (!UTC_TIMESTAMP.test(iso)) {
    return refuse('not-a-utc-timestamp');
  }
  const ms = Date.parse(iso);
  // Date.parse rolls a calendar-invalid date into the next one instead of
  // refusing it (2026-02-30 becomes March 2), so round-trip through
  // toISOString and compare against the canonical form of what was typed.
  if (
    Number.isNaN(ms) ||
    new Date(ms).toISOString() !== `${iso.slice(0, -1)}.000Z`
  ) {
    return refuse('not-a-utc-timestamp');
  }
  const parsed = instantSchema.safeParse(ms);
  return parsed.success ? ok(parsed.data) : refuse('not-a-utc-timestamp');
}

/** A UTC day, in seconds: UTC has no daylight saving. */
export const DAY_SECONDS = 86_400;

export function secondsAfter(instant: Instant, seconds: number): Instant {
  return instantSchema.parse(instant + seconds * 1000);
}

/**
 * The first instant after the whole of a UTC calendar day (`YYYY-MM-DD`):
 * a tournament whose end date it is stays on for all of that day, as
 * sportbet reads `end_date < today` in UTC (Tournament::effectiveStatus).
 */
export function dayAfter(isoDate: string): Result<Instant, 'not-a-date'> {
  const start = instantFrom(`${isoDate}T00:00:00Z`);
  return start.ok
    ? ok(secondsAfter(start.value, DAY_SECONDS))
    : refuse('not-a-date');
}
