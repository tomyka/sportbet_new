import { describe, expect, it } from 'vitest';
import { throttledBody, validationBody } from './laravel-answers';

// Laravel's answers to a JSON request, written once for both autosaves:
// a failed validation's 422 and a throttle's 429.

describe("Laravel's validation answer (422)", () => {
  it("each field's messages under its own name, `message` the first", () => {
    expect(
      validationBody([{ field: 'awayTeamScore', message: 'Įveskite abu.' }]),
    ).toEqual({
      message: 'Įveskite abu.',
      errors: { awayTeamScore: ['Įveskite abu.'] },
    });
  });

  it('more than one: "(and N more error)" or "errors", in English as Laravel writes it', () => {
    expect(
      validationBody([
        { field: 'homeTeamScore', message: 'A.' },
        { field: 'awayTeamScore', message: 'B.' },
      ]).message,
    ).toBe('A. (and 1 more error)');
    expect(
      validationBody([
        { field: 'homeTeamScore', message: 'A.' },
        { field: 'homeTeamScore', message: 'C.' },
        { field: 'awayTeamScore', message: 'B.' },
      ]),
    ).toEqual({
      message: 'A. (and 2 more errors)',
      errors: { homeTeamScore: ['A.', 'C.'], awayTeamScore: ['B.'] },
    });
  });
});

describe('the throttled answer (429)', () => {
  it("is a refusal with the sign-in throttles' text", () => {
    expect(throttledBody(3)).toEqual({
      success: false,
      message: 'Per daug bandymų. Pabandykite dar kartą po 3 min.',
    });
  });
});
