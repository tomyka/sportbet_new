import { numberFormat, onePlace } from '@sportbet/domain';

/** ScoringRules::plain: a whole point value, as the tiles and the formulas write it. */
export const plain = (value: number): string => String(value);

/**
 * ScoringRules::plain of a stored value in hundredths: no trailing zeros
 * ("50", "46", "12.5"), a real minus sign, not a hyphen, and no plus
 * (ScoringRules::plainSigned).
 */
export const pointsText = (hundredths: number): string =>
  numberFormat(hundredths, 2, { grouping: false })
    .replace(/\.?0+$/u, '')
    .replace('-', '−');

/** A stored two-place odds value: `number_format($odds, 2, '.', '')`. */
export const oddsText = (hundredths: number): string =>
  numberFormat(hundredths, 2, { grouping: false });

/** Winner points to one place: `number_format($points, 1, '.', '')`. */
export const winnerPointsText = (hundredths: number): string =>
  onePlace(hundredths, { grouping: false });
