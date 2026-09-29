import { phpRound, phpRoundScaled } from './php-round';

/**
 * sportbet's crowd-odds formula, `log2(total / count)` (CrowdOdds::of),
 * with the two roundings its callers apply. The only place the domain
 * computes with floats: the value is rounded to fixed point before it
 * leaves.
 */

/** Game odds in hundredths: rounded to four places, then two (CO-2). */
export function gameOddsHundredths(total: number, count: number): number {
  return phpRoundScaled(phpRound(Math.log2(total / count), 4), 2);
}

/** Standings odds in ten-thousandths: rounded once, to four places (ST-9). */
export function standingsOddsTenThousandths(
  total: number,
  count: number,
): number {
  return phpRoundScaled(Math.log2(total / count), 4);
}
