import { CrowdOdds, ruledRules } from '@sportbet/domain';
import { gameNo, rate } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { readSaveAnswer } from '../../components/predictions/save-answer';
import {
  busyAnswer,
  refusedAnswer,
  throttledAnswer,
} from '../request/save-answers';
import {
  postedSave,
  predictionRefusalAnswer,
  savedAnswer,
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
// Postgres 55P03): an answer the page shows, never a 500 (isLockTimeout
// is tested in request/save-answers.test.ts).
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
});

const fields = (
  over: Partial<Record<'game' | 'row' | 'home' | 'away', string>> = {},
) => ({
  game: '10',
  row: '10',
  home: '88',
  away: '79',
  ...over,
});

describe('postedSave: the form, then the two ids (decision 7)', () => {
  it("a field refused: Laravel's 422, the ids not read", () => {
    expect(postedSave(fields({ home: '88', away: '', game: 'x' }))).toEqual({
      ok: false,
      answer: validationAnswer([{ field: 'away', problem: 'half-typed' }]),
    });
  });

  it('an id missing or unreadable: "Šios prognozės išsaugoti negalima."', () => {
    for (const over of [{ game: '' }, { row: 'abc' }, { game: '2147483648' }]) {
      expect(postedSave(fields(over))).toEqual({
        ok: false,
        answer: {
          status: 422,
          body: {
            success: false,
            message: 'Šios prognozės išsaugoti negalima.',
          },
        },
      });
    }
  });

  it('both passed: the pair and the two games', () => {
    expect(postedSave(fields({ row: '11' }))).toEqual({
      ok: true,
      entry: { home: 88, away: 79 },
      game: gameNo(10),
      row: gameNo(11),
    });
  });
});

describe("predictionRefusalAnswer: savePrediction's refusals as sportbet answers them", () => {
  it('not yours and closed: their own text', () => {
    expect(predictionRefusalAnswer('not-yours')).toEqual({
      status: 422,
      body: { success: false, message: 'Šios prognozės išsaugoti negalima.' },
    });
    expect(predictionRefusalAnswer('closed')).toEqual({
      status: 422,
      body: { success: false, message: 'Šio mačo prognozuoti nebegalima.' },
    });
  });

  it('a refusal the form has already made is an impossible state', () => {
    for (const refusal of [
      'not-a-whole-number',
      'out-of-range',
      'half-typed',
      'level',
    ] as const) {
      expect(() => predictionRefusalAnswer(refusal)).toThrow(refusal);
    }
  });
});

describe("savedAnswer: sportbet's odds, the page's panel and the listing change", () => {
  it('one home vote: home 0, draw and away 1; the panel 50.0, 100.0, 100.0', () => {
    const odds = CrowdOdds.forGame(
      [{ origin: 'real', outcome: 'home' }],
      ruledRules,
    );
    expect(savedAnswer({ odds, rate: rate(1), listingChanged: true })).toEqual({
      status: 200,
      body: {
        success: true,
        home_odds: 0,
        draw_odds: 1,
        away_odds: 1,
        panel: { home: '50.0', away: '100.0', draw: '100.0' },
      },
      listingChanged: true,
    });
  });
});
