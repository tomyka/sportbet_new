import { PREDICTION_MAX, PREDICTION_MIN } from '@sportbet/domain';

/** sportbet's texts for a save (ScoreFormat, PredictionResultController; lang/lt.json). */
export const SAVE_TEXTS = {
  range: `Rezultatas turi būti nuo ${String(PREDICTION_MIN)} iki ${String(PREDICTION_MAX)}.`,
  bothScores: 'Įveskite abu rezultatus.',
  draw: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  notThisPrediction: 'Šios prognozės išsaugoti negalima.',
  closed: 'Šio mačo prognozuoti nebegalima.',
} as const;
