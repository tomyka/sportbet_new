import { phpRoundScaled } from '../points/php-round';
import type { RuleSet } from '../rules/rule-set';
import { checkAmount } from './amount';
import type { Cents, League, LeagueMember } from './league';

const THOUSANDS = /\B(?=(?:[0-9]{3})+$)/gu;

/** `number_format` of a sum in cents: its whole part grouped, then its decimals. */
function numberFormat(
  total: number,
  decimals: string,
  thousands: string,
  point: string,
): string {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`money: ${String(total)} is no amount of cents`);
  }
  const whole = String(Math.floor(total / 100)).replace(THOUSANDS, thousands);
  return `${whole}${point}${decimals}`;
}

const hundredths = (total: number): string =>
  String(total % 100).padStart(2, '0');

/** Does the league charge a fee? sportbet's `base_fee` is null, 0 or a whole euro amount. */
export function leagueHasFee(league: League): boolean {
  return (league.fee.base ?? 0) > 0;
}

/** `number_format($euros, 2, ',', ' ')`: a fee in whole euros, `1 234,00`. */
export function formatFee(wholeEuros: number): string {
  return numberFormat(wholeEuros * 100, '00', ' ', ',');
}

/** `number_format($amount, 2)`: a sum in cents, `1,234.50`. */
export function formatPot(total: number): string {
  return numberFormat(total, hundredths(total), ',', '.');
}

/** `number_format($amount, 2, '.', '')`: a sum in cents, `1234.50`. */
export function formatPlain(total: number): string {
  return numberFormat(total, hundredths(total), '', '.');
}

/**
 * A posted amount as the payments form reads it: trimmed, a comma read as the
 * decimal point, and accepted by every rule of the form (checkAmount); null
 * when blank or refused.
 */
export function parseAmount(text: string): Cents | null {
  const prepared = text.trim().replace(',', '.');
  if (prepared === '') return null;
  const checked = checkAmount(prepared);
  return checked.ok ? checked.cents : null;
}

/**
 * What an amount box holds: `20` for a whole amount, else the decimals with
 * their trailing zeros trimmed (`12.5`, `12.55`); empty for nothing paid.
 */
export function amountInputText(paid: Cents | null): string {
  if (paid === null) return '';
  const whole = String(Math.floor(paid / 100));
  return paid % 100 === 0
    ? whole
    : `${whole}.${hundredths(paid).replace(/0$/u, '')}`;
}

/**
 * The meter's bar: `min(100, round(collected / expected * 100))` percent,
 * 0 when nothing is expected. PHP divides doubles of euros and rounds with
 * `round()` (half away from zero, PHP 8.4); the same arithmetic here, so a
 * tie that the doubles land just below stays below. A display value: the
 * only float of the area, and nothing keeps it.
 */
export function barPercent(collected: number, expected: number): number {
  if (expected <= 0) return 0;
  const ratio = (collected / 100 / (expected / 100)) * 100;
  return Math.min(100, phpRoundScaled(ratio, 0));
}

/**
 * The league's two pots in cents. Expected: the whole-euro fee for every full
 * member. Collected: the sum of what was recorded, a guest's included under
 * sportbet and left out under R-88 (`collectedPotLeavesGuestsOut`).
 */
export function pots(input: {
  readonly baseFee: number | null;
  readonly members: readonly LeagueMember[];
  readonly rules: RuleSet;
}): { readonly expected: number; readonly collected: number } {
  const { baseFee, members, rules } = input;
  const full = members.filter((member) => !member.isGuest);
  const counted = rules.collectedPotLeavesGuestsOut ? full : members;
  return {
    expected: (baseFee ?? 0) * 100 * full.length,
    collected: counted.reduce((sum, member) => sum + (member.paid ?? 0), 0),
  };
}
