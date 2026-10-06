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
 * A leader's total as the hub prints it: PlayerTotals' ROUND(total, 1),
 * half away from zero, through number_format (`{{ number_format($p->total_points, 1) }} pt`).
 */
export function leaderPoints(totalCents: number): string {
  return numberFormat(roundUnits(totalCents, 1), 1);
}
