import { roundUnits } from '../points/fixed-point';

/**
 * PHP's number_format with its defaults, as sportbet prints numbers:
 * `units` hundredths-style fixed point with `places` decimals ("1,234",
 * "12.5"), ',' between thousands, '.' before the decimals. The value is
 * already rounded to `places`.
 */
export function numberFormat(units: number, places: number): string {
  const scale = 10 ** places;
  const sign = units < 0 ? '-' : '';
  const absolute = Math.abs(units);
  const whole = String(Math.floor(absolute / scale)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );
  if (places === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(absolute % scale).padStart(places, '0')}`;
}

/**
 * Hundredths to one decimal, as sportbet prints points on its pages:
 * `number_format(round($points, 1), 1)` ("79.5", "1,234.6").
 */
export function onePlace(hundredths: number): string {
  return numberFormat(roundUnits(hundredths, 1), 1);
}

/**
 * A leader's total as the hub prints it: PlayerTotals' ROUND(total, 1),
 * half away from zero, through number_format (`{{ number_format($p->total_points, 1) }} pt`).
 */
export function leaderPoints(totalCents: number): string {
  return onePlace(totalCents);
}

/** Cents (hundredths) as points: the one place a hundredth is divided out. */
export function centsToPoints(cents: number): number {
  return cents / 100;
}

/**
 * PHP's echo of a float sum, unrounded ("3", "1.5"): the league table's
 * survival column and the chart's axis labels.
 */
export function echoPoints(points: number): string {
  return String(points);
}

/**
 * Cents as whole points, `number_format($x, 0)` (survival's are whole):
 * `Math.round` of the points, so a half rounds up (-1.5 to -1).
 */
export function wholePoints(cents: number): string {
  return numberFormat(Math.round(centsToPoints(cents)), 0);
}
