import { describe, expect, it } from 'vitest';
import { score } from '../testing';
import { resultFormEntry } from './result-form';

describe('resultFormEntry (UpdateResultRequest)', () => {
  it('result form: a score, a postponement (R-63) and a clear', () => {
    expect(resultFormEntry({ home: '88', away: '79' })).toEqual({
      ok: true,
      value: { kind: 'score', score: score(88, 79) },
    });
    expect(resultFormEntry({ home: '-1', away: '-1' })).toEqual({
      ok: true,
      value: { kind: 'postpone' },
    });
    expect(resultFormEntry({ home: '', away: '' })).toEqual({
      ok: true,
      value: { kind: 'clear' },
    });
  });

  it("result form: each field's own rule first - a whole number, at most 150 (decision 6)", () => {
    expect(resultFormEntry({ home: 'x', away: '151' })).toEqual({
      ok: false,
      errors: [
        { field: 'home', problem: 'not-a-whole-number' },
        { field: 'away', problem: 'above-maximum' },
      ],
    });
  });

  it('result form: then any negative but -1 : -1, on each such field', () => {
    expect(resultFormEntry({ home: '-1', away: '80' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'negative' }],
    });
    expect(resultFormEntry({ home: '-2', away: '-1' })).toEqual({
      ok: false,
      errors: [
        { field: 'home', problem: 'negative' },
        { field: 'away', problem: 'negative' },
      ],
    });
  });

  it('result form (R-64): one box empty is "both scores", on the empty one', () => {
    expect(resultFormEntry({ home: '88', away: '' })).toEqual({
      ok: false,
      errors: [{ field: 'away', problem: 'half' }],
    });
  });
});
