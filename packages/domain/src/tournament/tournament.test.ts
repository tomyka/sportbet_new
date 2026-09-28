import { describe, expect, it } from 'vitest';
import type { Invariant } from '../invariant/invariant';
import { everyBmpCharacter } from '../testing';
import {
  slugInvariant,
  tournamentNameInvariant,
  tournamentSchema,
} from './tournament';

describe.each<[string, Invariant]>([
  ['slugInvariant', slugInvariant],
  ['tournamentNameInvariant', tournamentNameInvariant],
])('%s', (_, invariant) => {
  it.each(invariant.accepts)('accepts $label', ({ value }) => {
    expect(invariant.schema.safeParse(value).success).toBe(true);
  });

  it.each(invariant.refuses)('refuses $label', ({ value }) => {
    expect(invariant.schema.safeParse(value).success).toBe(false);
  });
});

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
    slug: 'euro-2028',
    name: 'Euro 2028',
    format: 'football',
  };

  it('accepts a valid tournament', () => {
    expect(tournamentSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an unknown format', { ...valid, format: 'tennis' }],
    ['a non-integer id', { ...valid, id: 1.5 }],
    ['a zero id', { ...valid, id: 0 }],
    ['a bad slug', { ...valid, slug: 'Euro 2028' }],
    ['a blank name', { ...valid, name: '   ' }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });
});
