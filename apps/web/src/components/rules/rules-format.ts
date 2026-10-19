import { numberFormat, onePlace } from '@sportbet/domain';

/** ScoringRules::plain: a whole point value, as the tiles and the formulas write it. */
export const plain = (value: number): string => String(value);

/** R-138: the margin rule's term, "|Δ|" at sportbet's slope 1, "2×|Δ|" at the ruled set's. */
export const missTerm = (slope: number): string =>
  slope === 1 ? '|Δ|' : `${plain(slope)}×|Δ|`;

/** R-138: how much of the miss is taken off, "tiek" at slope 1, "dvigubai tiek" at 2. */
export const missCostWords = (slope: number): string => {
  if (slope === 1) return 'tiek';
  return slope === 2 ? 'dvigubai tiek' : `${plain(slope)}× tiek`;
};

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
