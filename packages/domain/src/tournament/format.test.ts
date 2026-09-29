import { describe, expect, expectTypeOf, it } from 'vitest';
import { FORMATS, formatLabel, type Format } from './format';

describe('formatLabel', () => {
  it.each([['euroleague', 'Euroleague']] as const)(
    'labels %s as %s',
    (format, label) => {
      expect(formatLabel(format)).toBe(label);
    },
  );

  it('gives every format a label distinct from its raw value', () => {
    for (const format of FORMATS) {
      expect(formatLabel(format)).not.toBe(format);
    }
  });
});

describe('Format', () => {
  it('is exactly the closed union of decision 5', () => {
    expectTypeOf<Format>().toEqualTypeOf<'euroleague'>();
  });
});
