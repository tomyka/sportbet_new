/**
 * Fixed-point helpers: a value is a safe integer count of units
 * (hundredths or ten-thousandths). No float is ever stored or compared.
 */

/** Why a number was refused as a count of units. */
export type UnitsRefusal = 'not-whole-units';

/** A safe integer: something a fixed-point value can hold exactly. */
export function isWholeUnits(units: number): boolean {
  return Number.isSafeInteger(units);
}

/**
 * The internal constructors' check: their input is valid by construction
 * (a constant, or arithmetic on values already held), so a failure is a
 * programmer error and throws. Input from outside the domain goes through
 * the public factories, which refuse instead.
 */
export function assertUnits(units: number, what: string): void {
  if (!isWholeUnits(units)) {
    throw new Error(`${what}: ${String(units)} is not a whole number of units`);
  }
}

/** `units` with `places` decimals, e.g. (-4500, 2) is "-45.00". */
export function formatUnits(units: number, places: number): string {
  const scale = 10 ** places;
  const sign = units < 0 ? '-' : '';
  const absolute = Math.abs(units);
  const whole = Math.floor(absolute / scale);
  const fraction = String(absolute % scale).padStart(places, '0');
  return `${sign}${String(whole)}.${fraction}`;
}

/**
 * `units` divided by 10^places, rounded half away from zero, in exact
 * integer arithmetic.
 */
export function roundUnits(units: number, places: number): number {
  const scale = 10 ** places;
  const rounded = Math.floor((Math.abs(units) + scale / 2) / scale);
  return units < 0 ? -rounded : rounded;
}
