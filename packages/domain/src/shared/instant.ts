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
  const parsed = instantSchema.safeParse(
    UTC_TIMESTAMP.test(iso) ? Date.parse(iso) : Number.NaN,
  );
  return parsed.success ? ok(parsed.data) : refuse('not-a-utc-timestamp');
}

export function secondsAfter(instant: Instant, seconds: number): Instant {
  return instantSchema.parse(instant + seconds * 1000);
}
