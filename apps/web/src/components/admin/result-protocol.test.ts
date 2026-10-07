import { describe, expect, it } from 'vitest';
import {
  readResultAnswer,
  RESULT_FIELDS,
  resultRequestBody,
} from './result-protocol';

// POST /admin/updateResult's wire format, written once.

describe('the result protocol', () => {
  it("posts sportbet's three field names", () => {
    expect(RESULT_FIELDS).toEqual({
      game: 'gameID',
      home: 'homeTeamScore',
      away: 'awayTeamScore',
    });
    expect(
      resultRequestBody({ game: 7, home: '85', away: '80' }).toString(),
    ).toBe('gameID=7&homeTeamScore=85&awayTeamScore=80');
  });

  it("reads a 200 as saved, a 422's message as the refusal, anything else as not saved", () => {
    expect(readResultAnswer(200, { success: true }, 'Neišsaugota')).toEqual({
      kind: 'saved',
    });
    expect(
      readResultAnswer(
        422,
        {
          message: 'Įveskite abu rezultatus.',
          errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
        },
        'Neišsaugota',
      ),
    ).toEqual({ kind: 'refused', message: 'Įveskite abu rezultatus.' });
    for (const [status, body] of [
      [500, null],
      [200, { success: false }],
      [422, { other: 1 }],
      [303, null],
    ] as const) {
      expect(readResultAnswer(status, body, 'Neišsaugota')).toEqual({
        kind: 'refused',
        message: 'Neišsaugota',
      });
    }
  });
});
