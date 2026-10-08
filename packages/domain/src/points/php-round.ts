// PHP's php_intpow10 (ext/standard/math.c): a literal table for the whole
// supported range, not `10 ** places` - the table is exact where repeated
// multiplication (what `**` falls back to) can drift for the larger
// exponents, and this is what PHP itself reads from.
const POW10: readonly number[] = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14,
  1e15,
];

function pow10(places: number): number {
  const exponent = POW10[places];
  if (exponent === undefined) {
    throw new Error(`phpRound: unsupported places ${String(places)}`);
  }
  return exponent;
}

/**
 * PHP 8.4's `round($value, $places)` on a double, for the places sportbet
 * uses (0 to 15), returned as the rounded value times 10^places - an
 * integer, so no caller keeps a float.
 *
 * A port of `_php_math_round` and `php_round_helper` (php-src,
 * ext/standard/math.c): take the integral part at the requested places,
 * then round away from zero when the value reaches the half-way point as
 * the same double arithmetic computes it. That is why `round(0.585, 2)` is
 * 0.59 in PHP while `Math.round(0.585 * 100) / 100` is 0.58 (catalogue,
 * conventions; CO-2). Proven against PHP itself on every case in
 * `test/php-reference/round-cases.json`; nothing here is taken from
 * documentation.
 */
export function phpRoundScaled(value: number, places: number): number {
  assertRoundable(value, places);
  if (value === 0) {
    return 0;
  }
  const exponent = pow10(places);
  const sign = value > 0 ? 1 : -1;
  let integral =
    sign > 0 ? Math.floor(value * exponent) : Math.ceil(value * exponent);
  // The product can land one below the value it stands for.
  if ((integral + sign) / exponent === value) {
    integral += sign;
  }
  if (Math.abs(integral) >= 1e16) {
    throw new Error(`phpRound: ${String(value)} is beyond double precision`);
  }
  const edge = Math.abs((integral + sign * 0.5) / exponent);
  if (Math.abs(value) >= edge) {
    integral += sign;
  }
  return integral;
}

/** What phpRound takes: places 0 to 15, and a finite value. */
function assertRoundable(value: number, places: number): void {
  if (!Number.isInteger(places) || places < 0 || places > 15) {
    throw new Error(`phpRound: unsupported places ${String(places)}`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`phpRound: cannot round ${String(value)}`);
  }
}

/** `round($value, $places)` as the double PHP returns. */
export function phpRound(value: number, places: number): number {
  return phpRoundScaled(value, places) / pow10(places);
}
