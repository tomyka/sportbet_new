import { describe, expect, it } from 'vitest';
import {
  BLANK_NAMES,
  INVALID_SLUGS,
  VALID_SLUGS,
  jsWhitespaceCodePoints,
} from './tricky-inputs';
import {
  NAME_NOT_BLANK_PATTERN,
  slugSchema,
  tournamentSchema,
} from './tournament';

describe('slugSchema', () => {
  it.each(VALID_SLUGS.map(({ label, value }) => [label, value] as const))(
    'accepts %s',
    (_, slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(true);
    },
  );

  it.each(INVALID_SLUGS.map(({ label, value }) => [label, value] as const))(
    'rejects a slug that is %s',
    (_, slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe('tournamentSchema', () => {
  const valid = {
    id: 1,
    slug: 'euro-2028',
    name: 'Euro 2028',
    format: 'football',
  };

  it('accepts a valid tournament', () => {
    expect(tournamentSchema.parse(valid)).toEqual(valid);
  });

  it.each(
    BLANK_NAMES.map(
      ({ label, value }) =>
        [`a name of only ${label}`, { ...valid, name: value }] as const,
    ),
  )('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['an unknown format', { ...valid, format: 'tennis' }],
    ['a non-integer id', { ...valid, id: 1.5 }],
    ['a zero id', { ...valid, id: 0 }],
    ['a bad slug', { ...valid, slug: 'Euro 2028' }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });
});

describe('NAME_NOT_BLANK_PATTERN', () => {
  it("agrees with JavaScript's definition of whitespace on every code point (excluding surrogates)", () => {
    const notBlank = new RegExp(NAME_NOT_BLANK_PATTERN);
    const whitespace = new Set(jsWhitespaceCodePoints());
    const mismatches: number[] = [];
    for (let codePoint = 1; codePoint <= 0xffff; codePoint++) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogates
      const isWhitespace = whitespace.has(codePoint);
      const matchesNotBlank = notBlank.test(String.fromCharCode(codePoint));
      if (matchesNotBlank === isWhitespace) mismatches.push(codePoint);
    }
    expect(mismatches).toEqual([]);
  });
});
