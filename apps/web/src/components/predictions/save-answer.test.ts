import { describe, expect, it } from 'vitest';
import { NOT_SAVED, readSaveAnswer } from './save-answer';

describe("readSaveAnswer (the autosave's .done and .fail)", () => {
  it('saved: the new panel', () => {
    expect(
      readSaveAnswer(200, {
        success: true,
        home_odds: 0,
        draw_odds: 2.32,
        away_odds: 1,
        panel: { home: '50.0', away: '100.0', draw: '166.0' },
      }),
    ).toEqual({ kind: 'saved', panel: { home: '50.0', away: '100.0' } });
  });

  it("a field error: the first field's first message, as sportbet shows it", () => {
    expect(
      readSaveAnswer(422, {
        message: 'Rezultatas turi būti nuo 50 iki 120. (and 1 more error)',
        errors: {
          homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
          awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
        },
      }),
    ).toEqual({
      kind: 'refused',
      message: 'Rezultatas turi būti nuo 50 iki 120.',
    });
  });

  it('R-59: a refusal shows its own reason, where sportbet showed "Spėjimas neišsaugotas"', () => {
    expect(
      readSaveAnswer(422, {
        success: false,
        message: 'Šio mačo prognozuoti nebegalima.',
      }),
    ).toEqual({ kind: 'refused', message: 'Šio mačo prognozuoti nebegalima.' });
  });

  it("too many saves (429): the throttle's own text", () => {
    expect(
      readSaveAnswer(429, {
        success: false,
        message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
      }),
    ).toEqual({
      kind: 'refused',
      message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
    });
  });

  it('anything else is "not saved": a 401, a 404, a 500, a body that is not the answer', () => {
    for (const [status, body] of [
      [401, { message: 'Unauthenticated.' }],
      [404, null],
      [500, null],
      [200, { success: true }],
      [422, 'nope'],
    ] as const) {
      expect(readSaveAnswer(status, body)).toEqual({
        kind: 'refused',
        message: NOT_SAVED,
      });
    }
  });
});
