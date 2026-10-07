import type { Instant } from './instant';

/** YYYY-MM-DD in Vilnius: the en-CA locale writes dates that way. */
const VILNIUS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vilnius',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar day an instant falls on in Vilnius, YYYY-MM-DD, summer time
 * and winter time alike (sportbet's VilniusDay): where a rule is drawn by
 * day - the game page's deck, its "N šiandien" - the day is Vilnius's.
 */
export function vilniusDay(instant: Instant): string {
  return VILNIUS_DATE.format(instant);
}
