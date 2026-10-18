import { describe, expect, it } from 'vitest';
import { googleId, googleIdInvariant } from './google-id';

describe('googleIdInvariant', () => {
  it.each(googleIdInvariant.accepts)('accepts $label', ({ value }) => {
    expect(googleIdInvariant.schema.safeParse(value).success).toBe(true);
  });

  it.each(googleIdInvariant.refuses)('refuses $label', ({ value }) => {
    expect(googleIdInvariant.schema.safeParse(value).success).toBe(false);
  });

  it('holds the examples the plan names', () => {
    const accepted = googleIdInvariant.accepts.map(({ value }) => value);
    expect(accepted).toContain('104520385693274017345');
    expect(accepted).toContain('a_b-C');
    const refused = googleIdInvariant.refuses.map(({ value }) => value);
    expect(refused).toEqual(expect.arrayContaining(['', 'a b', "a'b", '1;2']));
  });
});

describe('googleId', () => {
  it('makes an id of a valid sub', () => {
    expect(googleId('104520385693274017345')).toEqual({
      ok: true,
      value: '104520385693274017345',
    });
  });

  it('refuses what the invariant refuses, and anything that is no text', () => {
    expect(googleId('')).toEqual({ ok: false, refusal: 'invalid' });
    expect(googleId('a'.repeat(256))).toEqual({
      ok: false,
      refusal: 'invalid',
    });
    expect(googleId(1.5e20)).toEqual({
      ok: false,
      refusal: 'invalid',
    });
    expect(googleId(null)).toEqual({ ok: false, refusal: 'invalid' });
  });

  it('keeps case: two subs differing only in case are two ids', () => {
    expect(googleId('Abc')).not.toEqual(googleId('abc'));
  });
});
