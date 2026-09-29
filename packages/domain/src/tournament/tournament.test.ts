import { describe, expect, it } from 'vitest';
import { everyBmpCharacter } from '../testing';
import { tournamentNameInvariant, tournamentSchema } from './tournament';

describe('tournamentNameInvariant', () => {
  it("agrees with JavaScript's definition of whitespace on every BMP character", () => {
    const mismatches = everyBmpCharacter()
      .filter(
        (character) =>
          tournamentNameInvariant.schema.safeParse(character).success ===
          /^\s$/.test(character),
      )
      .map((character) => character.codePointAt(0));
    expect(mismatches).toEqual([]);
  });
});

describe('tournamentSchema', () => {
  const valid = {
    id: 1,
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
  };

  it('accepts a valid tournament', () => {
    expect(tournamentSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an unknown format', { ...valid, format: 'tennis' }],
    ['a non-integer id', { ...valid, id: 1.5 }],
    ['a zero id', { ...valid, id: 0 }],
    ['a bad slug', { ...valid, slug: 'Euroleague 2026' }],
    ['a blank name', { ...valid, name: '   ' }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });
});
