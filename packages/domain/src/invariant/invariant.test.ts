import { describe, expect, it } from 'vitest';
import { defineInvariant } from './invariant';

const letters = {
  name: 'letters',
  pattern: '^[a-z]+$',
  accepts: [{ label: 'a word', value: 'euro' }],
  refuses: [{ label: 'a digit', value: 'euro1' }],
};

describe('defineInvariant', () => {
  it.each([
    ['a single quote', "^[a-z']+$"],
    ['a double quote', '^[a-z"]+$'],
  ])('refuses a pattern containing %s', (_, pattern) => {
    expect(() => defineInvariant({ ...letters, pattern })).toThrow(
      /letters.*quote/,
    );
  });

  it.each([
    ['zero', 0],
    ['a negative number', -1],
    ['a fraction', 1.5],
  ])('refuses a maximum length of %s', (_, maxLength) => {
    expect(() => defineInvariant({ ...letters, maxLength })).toThrow(
      /letters.*maximum length/,
    );
  });

  it('refuses an accepted example its own schema refuses, naming it', () => {
    expect(() =>
      defineInvariant({
        ...letters,
        accepts: [{ label: 'a capital', value: 'Euro' }],
      }),
    ).toThrow(/letters.*a capital/);
  });

  it('refuses a refused example its own schema accepts, naming it', () => {
    expect(() =>
      defineInvariant({
        ...letters,
        refuses: [{ label: 'a word', value: 'euro' }],
      }),
    ).toThrow(/letters.*a word/);
  });

  it('keeps the name, pattern and examples it was given', () => {
    const invariant = defineInvariant(letters);
    expect(invariant).toMatchObject(letters);
    expect(invariant.maxLength).toBeUndefined();
  });

  it('derives a schema that holds the pattern', () => {
    const { schema } = defineInvariant(letters);
    expect(schema.safeParse('euro').success).toBe(true);
    expect(schema.safeParse('Euro').success).toBe(false);
    expect(schema.safeParse(1).success).toBe(false);
  });

  it('derives a schema that holds the maximum length', () => {
    const { schema } = defineInvariant({ ...letters, maxLength: 4 });
    expect(schema.safeParse('euro').success).toBe(true);
    expect(schema.safeParse('euros').success).toBe(false);
  });

  // Postgres char_length counts code points, not UTF-16 units: the two
  // sides must agree on a character outside the Basic Multilingual Plane.
  it('counts the maximum length in code points, as Postgres does', () => {
    const { schema } = defineInvariant({
      ...letters,
      pattern: '^.+$',
      maxLength: 2,
      accepts: [],
      refuses: [],
    });
    expect(schema.safeParse('\u{1F600}\u{1F600}').success).toBe(true);
    expect(schema.safeParse('\u{1F600}\u{1F600}\u{1F600}').success).toBe(false);
  });
});
