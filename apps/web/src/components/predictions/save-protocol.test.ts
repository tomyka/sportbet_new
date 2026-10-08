import { describe, expect, it } from 'vitest';
import { refusalSchema } from '../save/laravel-save';
import {
  fieldErrorsSchema,
  SAVE_FIELDS,
  savedSchema,
  saveRequestBody,
} from './save-protocol';

// The save's wire format, written once: the posted fields as sportbet's
// pages name them, and each answer the route can give.

describe('the save protocol', () => {
  it("posts sportbet's field names, in its order", () => {
    expect(SAVE_FIELDS).toEqual({
      game: 'gameID',
      row: 'prediction_gameID',
      home: 'homeTeamScore',
      away: 'awayTeamScore',
    });
    expect(
      saveRequestBody({ game: 10, row: 10, home: '88', away: '79' }).toString(),
    ).toBe('gameID=10&prediction_gameID=10&homeTeamScore=88&awayTeamScore=79');
  });

  it("each answer's shape: saved, field errors, a refusal", () => {
    expect(
      savedSchema.safeParse({
        success: true,
        home_odds: 0,
        draw_odds: 1,
        away_odds: 1,
        panel: { home: '50.0', away: '100.0', draw: '100.0' },
      }).success,
    ).toBe(true);
    expect(savedSchema.safeParse({ success: true }).success).toBe(false);
    expect(
      fieldErrorsSchema.safeParse({
        message: 'Įveskite abu rezultatus.',
        errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
      }).success,
    ).toBe(true);
    expect(
      fieldErrorsSchema.safeParse({
        message: 'x',
        errors: { gameID: ['x'] },
      }).success,
    ).toBe(false);
    expect(
      refusalSchema.safeParse({
        success: false,
        message: 'Šio mačo prognozuoti nebegalima.',
      }).success,
    ).toBe(true);
  });
});
