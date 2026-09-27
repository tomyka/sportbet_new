import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, slugSchema, tournamentSchema } from './tournament';

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
    ['an unknown format', { ...valid, format: 'tennis' }],
    ['a non-integer id', { ...valid, id: 1.5 }],
    ['a zero id', { ...valid, id: 0 }],
    ['a bad slug', { ...valid, slug: 'Euro 2028' }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });
});
