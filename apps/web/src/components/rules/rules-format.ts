import { numberFormat, onePlace } from '@sportbet/domain';

/** ScoringRules::plain: a point value without a trailing `.0`. */
export const plain = (value: number): string => String(value);

/** ScoringRules::plainSigned: a real minus sign, not a hyphen, and no plus. */
export const plainSigned = (value: number): string =>
  value < 0 ? `−${plain(Math.abs(value))}` : plain(value);

/** A stored two-place odds value: `number_format($odds, 2, '.', '')`. */
export const oddsText = (hundredths: number): string =>
  numberFormat(hundredths, 2).replaceAll(',', '');

/** Winner points to one place: `number_format($points, 1, '.', '')`. */
export const winnerPointsText = (hundredths: number): string =>
  onePlace(hundredths).replaceAll(',', '');
