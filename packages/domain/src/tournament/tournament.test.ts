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
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  };

  it('accepts a valid tournament', () => {
    expect(tournamentSchema.parse(valid)).toEqual(valid);
  });

  it('accepts an admin standings deadline round', () => {
    const withDeadline = { ...valid, standingsDeadlineRound: 6 };
    expect(tournamentSchema.parse(withDeadline)).toEqual(withDeadline);
  });

  it.each([
    ['an unknown format', { ...valid, format: 'tennis' }],
    ['a non-integer id', { ...valid, id: 1.5 }],
    ['a zero id', { ...valid, id: 0 }],
    ['a bad slug', { ...valid, slug: 'Euroleague 2026' }],
    ['a blank name', { ...valid, name: '   ' }],
    [
      'a timestamp for an end date',
      { ...valid, endsOn: '2027-05-23T00:00:00Z' },
    ],
    ['an impossible end date', { ...valid, endsOn: '2027-02-30' }],
    ['a deadline round of 0', { ...valid, standingsDeadlineRound: 0 }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
  });
});
