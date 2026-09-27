import { describe, expect, it } from 'vitest';
import {
  NAME_NOT_BLANK_PATTERN,
  SLUG_MAX_LENGTH,
  slugSchema,
  tournamentSchema,
} from './tournament';

describe('slugSchema', () => {
  it.each([
    'a',
    'euro-2028',
    'euroleague-2026-27',
    'a'.repeat(SLUG_MAX_LENGTH),
  ])('accepts %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(SLUG_MAX_LENGTH + 1)],
    ['uppercase', 'Euro-2028'],
    ['a space', 'euro 2028'],
    ['an underscore', 'euro_2028'],
    ['a slash', 'euro/2028'],
  ])('rejects a slug with %s', (_, slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });
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

  it.each([
    ['a blank name', { ...valid, name: '   ' }],
    ['a name of only no-break spaces', { ...valid, name: '\u00a0\u00a0' }],
    ['a name of only a byte-order mark', { ...valid, name: '\ufeff' }],
    ['an unknown format', { ...valid, format: 'tennis' }],
    ['a non-integer id', { ...valid, id: 1.5 }],
    ['a zero id', { ...valid, id: 0 }],
    ['a bad slug', { ...valid, slug: 'Euro 2028' }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });
});

describe('NAME_NOT_BLANK_PATTERN', () => {
  it('agrees with /\\S/ on every code point (excluding surrogates)', () => {
    const notBlank = new RegExp(NAME_NOT_BLANK_PATTERN);
    const mismatches: number[] = [];
    for (let codePoint = 0; codePoint <= 0xffff; codePoint++) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        continue;
      }
      const char = String.fromCharCode(codePoint);
      if (notBlank.test(char) !== /\S/.test(char)) {
        mismatches.push(codePoint);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
