import { describe, expect, it } from 'vitest';
import {
  fieldsAnswer,
  refusalAnswer,
  SAVED_ANSWER,
  throttledResultAnswer,
} from './save-result';

describe("the result save's answers", () => {
  it('answer: saved is 200 {success: true}', () => {
    expect(SAVED_ANSWER).toEqual({ status: 200, body: { success: true } });
  });

  it("answer: the boxes' errors are Laravel's 422, message the first", () => {
    expect(
      fieldsAnswer([
        { field: 'home', problem: 'negative' },
        { field: 'away', problem: 'negative' },
      ]),
    ).toEqual({
      status: 422,
      body: {
        message:
          'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1. (and 1 more error)',
        errors: {
          homeTeamScore: [
            'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
          ],
          awayTeamScore: [
            'Rezultatas negali būti neigiamas. Atidėtoms rungtynėms įveskite -1 : -1.',
          ],
        },
      },
    });
  });

  it.each([
    ['not-started', 'Rungtynės dar neprasidėjo - rezultato įvesti negalima.'],
    ['level', 'Lygiosios negalimos - komandų rezultatai turi skirtis.'],
    ['frozen', 'Turnyras baigtas - rezultatų keisti negalima.'],
  ] as const)('answer: %s is a 422 on the home box', (refusal, text) => {
    expect(refusalAnswer(refusal)).toEqual({
      status: 422,
      body: { message: text, errors: { homeTeamScore: [text] } },
    });
  });

  it("answer: too many saves (R-69) is a 429 with the throttle's text", () => {
    expect(throttledResultAnswer(1)).toEqual({
      status: 429,
      body: {
        success: false,
        message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
      },
    });
  });
});
