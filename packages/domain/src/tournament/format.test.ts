import { describe, expect, expectTypeOf, it } from 'vitest';
import { FORMATS, formatLabel, type Format } from './format';

describe('formatLabel', () => {
  it.each([
    ['football', 'Football'],
    ['euroleague', 'Euroleague'],
  ] as const)('labels %s as %s', (format, label) => {
    expect(formatLabel(format)).toBe(label);
  });

  it('gives every format a distinct label', () => {
    expect(new Set(FORMATS.map(formatLabel)).size).toBe(FORMATS.length);
  });
});

describe('Format', () => {
  it('is exactly the closed union of decision 5', () => {
    expectTypeOf<Format>().toEqualTypeOf<'football' | 'euroleague'>();
  });
});
