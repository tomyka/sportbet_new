import { describe, expect, it } from 'vitest';
import { defineRangeInvariant } from './range-invariant';

const count = {
  name: 'count',
  min: 0,
  accepts: [{ label: 'none', value: 0 }],
  refuses: [{ label: 'minus one', value: -1 }],
};

const place = {
  name: 'place',
  min: 1,
  max: 4,
  accepts: [{ label: 'the champion', value: 1 }],
  refuses: [{ label: 'zero', value: 0 }],
};

describe('defineRangeInvariant', () => {
  it.each([
    ['a fraction', 0.5],
    ['an unsafe integer', 2 ** 53],
  ])('refuses a minimum that is %s', (_, min) => {
    expect(() => defineRangeInvariant({ ...place, min })).toThrow(
      /place.*minimum/,
    );
  });

  it.each([
    ['below the minimum', 0],
    ['a fraction', 3.5],
  ])('refuses a maximum %s', (_, max) => {
    expect(() => defineRangeInvariant({ ...place, max })).toThrow(
      /place.*maximum/,
    );
  });

  it('refuses an accepted example its own schema refuses, naming it', () => {
    expect(() =>
      defineRangeInvariant({
        ...place,
        accepts: [{ label: 'fifth', value: 5 }],
      }),
    ).toThrow(/place.*fifth/);
  });

  it('refuses a refused example its own schema accepts, naming it', () => {
    expect(() =>
      defineRangeInvariant({
        ...place,
        refuses: [{ label: 'second', value: 2 }],
      }),
    ).toThrow(/place.*second/);
  });

  it('keeps the name, bounds and examples it was given', () => {
    expect(defineRangeInvariant(place)).toMatchObject(place);
    expect(defineRangeInvariant(count).max).toBeUndefined();
  });

  it('derives a schema that holds both bounds', () => {
    const { schema } = defineRangeInvariant(place);
    expect(
      [0, 1, 4, 5].map((value) => schema.safeParse(value).success),
    ).toEqual([false, true, true, false]);
  });

  it('derives a schema with no upper bound when there is no maximum', () => {
    const { schema } = defineRangeInvariant(count);
    expect(schema.safeParse(2 ** 40).success).toBe(true);
  });

  it('derives a schema that refuses a fraction, text and an unsafe integer', () => {
    const { schema } = defineRangeInvariant(count);
    expect(schema.safeParse(1.5).success).toBe(false);
    expect(schema.safeParse('2').success).toBe(false);
    expect(schema.safeParse(2 ** 53).success).toBe(false);
  });

  it('refuses a value out of range, naming the invariant', () => {
    const result = defineRangeInvariant(place).schema.safeParse(0);
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'A place is at least 1',
    ]);
  });
});
