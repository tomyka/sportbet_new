import { describe, expect, it } from 'vitest';
import { predictionFormEntry } from './prediction-form';

// UpdatePredictionResultRequest: the posted pair, after Laravel's
// TrimStrings and ConvertEmptyStringsToNull, in its order - each field's
// `integer|min:50|max:120`, then (only when those pass) both or neither,
// then not level.

describe('predictionFormEntry (UpdatePredictionResultRequest)', () => {
  it('form: two whole scores from 50 to 120, or neither', () => {
    expect(predictionFormEntry({ home: '88', away: '79' })).toEqual({
      ok: true,
      value: { home: 88, away: 79 },
    });
    expect(predictionFormEntry({ home: '', away: '' })).toEqual({
      ok: true,
      value: { home: null, away: null },
    });
    expect(predictionFormEntry({ home: '50', away: '120' })).toEqual({
      ok: true,
      value: { home: 50, away: 120 },
    });
  });

  it("form: a side that is no whole number, or outside 50-120, is that field's range error - both fields at once", () => {
    for (const bad of ['49', '121', '8.5', 'abc', '007', '1e2', '-80']) {
      expect(predictionFormEntry({ home: bad, away: '79' })).toEqual({
        ok: false,
        errors: [{ field: 'home', problem: 'out-of-range' }],
      });
    }
    expect(predictionFormEntry({ home: '130', away: '20' })).toEqual({
      ok: false,
      errors: [
        { field: 'home', problem: 'out-of-range' },
        { field: 'away', problem: 'out-of-range' },
      ],
    });
  });

  it("form: Laravel's integer takes a sign: +88 is 88", () => {
    expect(predictionFormEntry({ home: '+88', away: '79' })).toEqual({
      ok: true,
      value: { home: 88, away: 79 },
    });
  });

  it('form (R-15): one side alone is "both scores" on the blank one', () => {
    expect(predictionFormEntry({ home: '88', away: '' })).toEqual({
      ok: false,
      errors: [{ field: 'away', problem: 'half-typed' }],
    });
    expect(predictionFormEntry({ home: '', away: '79' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'half-typed' }],
    });
  });

  it('form: a level pair is the home field\'s "no draws"', () => {
    expect(predictionFormEntry({ home: '80', away: '80' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'level' }],
    });
  });

  it("form: a range error stops before both-or-neither, as Laravel's after() hook does", () => {
    expect(predictionFormEntry({ home: '200', away: '' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'out-of-range' }],
    });
  });
});
