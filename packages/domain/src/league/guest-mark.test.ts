import { describe, expect, it } from 'vitest';
import { markGuest } from './guest-mark';

describe('markGuest (R-87)', () => {
  it('marks a full member a guest', () => {
    expect(markGuest({ isGuest: false }, true)).toEqual({
      ok: true,
      value: { isGuest: true },
    });
  });

  it('makes a guest a full member again', () => {
    expect(markGuest({ isGuest: true }, false)).toEqual({
      ok: true,
      value: { isGuest: false },
    });
  });

  it('refuses a mark that changes nothing', () => {
    expect(markGuest({ isGuest: true }, true)).toEqual({
      ok: false,
      refusal: 'unchanged',
    });
    expect(markGuest({ isGuest: false }, false)).toEqual({
      ok: false,
      refusal: 'unchanged',
    });
  });

  it('refuses a player who is no member of the league', () => {
    expect(markGuest(null, true)).toEqual({ ok: false, refusal: 'not-member' });
    expect(markGuest(null, false)).toEqual({
      ok: false,
      refusal: 'not-member',
    });
  });
});
