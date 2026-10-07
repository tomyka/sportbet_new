import { describe, expect, it } from 'vitest';
import { readSaveAnswer } from '../../components/predictions/save-answer';
import {
  busyAnswer,
  isLockTimeout,
  refusedAnswer,
  throttledAnswer,
  validationAnswer,
} from './save-prediction';
import { SAVE_TEXTS } from './texts';

describe("validationAnswer (Laravel's 422 for UpdatePredictionResultRequest)", () => {
  it("each field's message under its sportbet name; the message is the first", () => {
    expect(
      validationAnswer([{ field: 'away', problem: 'half-typed' }]),
    ).toEqual({
      status: 422,
      body: {
        message: 'Įveskite abu rezultatus.',
        errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
      },
    });
    expect(
      validationAnswer([{ field: 'home', problem: 'level' }]).body,
    ).toEqual({
      message: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
      errors: {
        homeTeamScore: [
          'Lygiosios negalimos - komandų rezultatai turi skirtis.',
        ],
      },
    });
  });

  it('two errors: Laravel\'s "(and 1 more error)" after the first', () => {
    expect(
      validationAnswer([
        { field: 'home', problem: 'out-of-range' },
        { field: 'away', problem: 'out-of-range' },
      ]).body,
    ).toEqual({
      message: 'Rezultatas turi būti nuo 50 iki 120. (and 1 more error)',
      errors: {
        homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
        awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
      },
    });
  });
});

// The protocol's point: what the server answers is what the page reads.
describe('every answer the save builds, as the page reads it', () => {
  it("field errors: the first field's message", () => {
    const answer = validationAnswer([
      { field: 'home', problem: 'out-of-range' },
      { field: 'away', problem: 'half-typed' },
    ]);
    expect(readSaveAnswer(answer.status, answer.body)).toEqual({
      kind: 'refused',
      message: 'Rezultatas turi būti nuo 50 iki 120.',
    });
  });

  it('a refusal and too many saves: their own text (R-59)', () => {
    for (const answer of [
      refusedAnswer(SAVE_TEXTS.closed),
      refusedAnswer(SAVE_TEXTS.notThisPrediction),
      throttledAnswer(1),
    ]) {
      expect(readSaveAnswer(answer.status, answer.body)).toEqual({
        kind: 'refused',
        message: answer.body.message,
      });
    }
    expect(throttledAnswer(1)).toEqual({
      status: 429,
      body: {
        success: false,
        message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
      },
    });
  });
});

// savePrediction gives up after 5 s waiting for a lock (lock_timeout,
// Postgres 55P03): an answer the page shows, never a 500.
describe('a save that waited too long for a lock', () => {
  it('is a 503 the page reads as "Spėjimas neišsaugotas. Bandykite dar kartą."', () => {
    const answer = busyAnswer();
    expect(answer).toEqual({
      status: 503,
      body: {
        success: false,
        message: 'Spėjimas neišsaugotas. Bandykite dar kartą.',
      },
    });
    expect(readSaveAnswer(answer.status, answer.body)).toEqual({
      kind: 'refused',
      message: 'Spėjimas neišsaugotas. Bandykite dar kartą.',
    });
  });

  it('is told by its cause, 55P03; any other error is not', () => {
    const cause = Object.assign(new Error('canceling statement'), {
      code: '55P03',
    });
    expect(isLockTimeout(new Error('query failed', { cause }))).toBe(true);
    const other = Object.assign(new Error('x'), { code: '23505' });
    expect(isLockTimeout(new Error('query failed', { cause: other }))).toBe(
      false,
    );
    expect(isLockTimeout(new Error('no cause'))).toBe(false);
  });
});
