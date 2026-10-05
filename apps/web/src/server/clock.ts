import { instantFrom, type Instant } from '@sportbet/domain';

/** An instant (or any millisecond count) as ISO-8601 UTC to the second, the form instantFrom reads. */
export function isoSecond(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
}

/** The current moment, to the second, as the domain takes time: injected, never read inside it. */
export function now(): Instant {
  const parsed = instantFrom(isoSecond(Date.now()));
  if (!parsed.ok) throw new Error('clock: the current time is not an instant');
  return parsed.value;
}
