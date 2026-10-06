import { describe, expect, it } from 'vitest';
import { tallyMedals } from './medal-tally';

// MedalTally::forTournament: how many players put each team first, second,
// third and fourth, most firsts first.

describe('tallyMedals', () => {
  it('medals: counts each final place per team, most firsts, then seconds, then thirds first', () => {
    expect(
      tallyMedals([
        { team: 'Real Madrid', finalPlace: 1 },
        { team: 'Zalgiris Kaunas', finalPlace: 1 },
        { team: 'Zalgiris Kaunas', finalPlace: 1 },
        { team: 'Real Madrid', finalPlace: 2 },
        { team: 'Olympiacos Piraeus', finalPlace: 2 },
        { team: 'Olympiacos Piraeus', finalPlace: 4 },
      ]),
    ).toEqual([
      { team: 'Zalgiris Kaunas', first: 2, second: 0, third: 0, fourth: 0 },
      { team: 'Real Madrid', first: 1, second: 1, third: 0, fourth: 0 },
      { team: 'Olympiacos Piraeus', first: 0, second: 1, third: 0, fourth: 1 },
    ]);
  });

  it("medals: equal counts are listed by team name as MySQL's unicode_ci orders it", () => {
    expect(
      tallyMedals([
        { team: 'Žalgiris', finalPlace: 1 },
        { team: 'Zenit', finalPlace: 1 },
        { team: 'Barcelona', finalPlace: 1 },
      ]).map(({ team }) => team),
    ).toEqual(['Barcelona', 'Žalgiris', 'Zenit']);
  });

  it('medals: no picks, no rows', () => {
    expect(tallyMedals([])).toEqual([]);
  });
});
