import type { ResultFieldProblem } from '@sportbet/domain';

/**
 * The result save's texts: UpdateResultRequest's (lang/lt.json), and
 * three this app adds where sportbet answers in Laravel's English or has
 * no case (design decision 6, owner to confirm).
 */
export const RESULT_TEXTS = {
  field: {
    'not-a-whole-number': 'Įveskite sveiką skaičių.',
    'above-maximum': 'Rezultatas negali būti didesnis nei 150.',
    negative:
      'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
    half: 'Įveskite abu rezultatus.',
  } satisfies Readonly<Record<ResultFieldProblem, string>>,
  notStarted: 'Rungtynės dar neprasidėjo - rezultato įvesti negalima.',
  level: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  frozen: 'Turnyras baigtas - rezultatų keisti negalima.',
} as const;
