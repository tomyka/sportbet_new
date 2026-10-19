import { describe, expect, it } from 'vitest';
import { EUROLEAGUE_STAGE_NAMES } from '../summary/standings-summary';
import { ruledRules, sportbetRules, type RuleSet } from './rule-set';
import { rulesPage } from './rules-page';

const FACTS = { teamCount: 20, deadlineRound: 5, survival: true } as const;

const bothSets: readonly (readonly [string, RuleSet])[] = [
  ['sportbetRules', sportbetRules],
  ['ruledRules', ruledRules],
];

/** Every leaf of a value as `path -> JSON`, to list the keys two pages differ in. */
function leaves(value: unknown, path: string): Map<string, string> {
  const primitives =
    Array.isArray(value) && value.every((each) => typeof each !== 'object');
  if (typeof value === 'object' && value !== null && !primitives) {
    return new Map(
      Object.entries(value).flatMap(([key, inner]) => [
        ...leaves(inner, path === '' ? key : `${path}.${key}`),
      ]),
    );
  }
  return new Map([[path, JSON.stringify(value)]]);
}

describe.each(bothSets)('rulesPage under %s', (_name, rules) => {
  const page = rulesPage(rules, FACTS);

  it('the tiles: the winner bonus 50, the margin base 50, serija step 5 (R-106), whatever the set', () => {
    expect(page.tiles).toMatchObject({
      winnerBonus: 50,
      marginBase: 50,
      serijaStep: 5,
    });
  });

  it("the margin table's tiles are the rule set's own (R-138)", () => {
    expect(page.tiles).toMatchObject({
      differenceSlope: rules.differenceSlope,
      bingo: rules.exactScoreBonus,
      exactMargin: rules.exactDifferenceBonus,
    });
  });

  it("carries the areas' published figures: five margin examples, five odds examples, three serija rows, the places, the bracket and the finals grid", () => {
    expect(page.marginExamples).toHaveLength(5);
    expect(page.oddsExamples).toHaveLength(5);
    expect(
      page.serijaExamples.map(({ bonusHundredths }) => bonusHundredths),
    ).toEqual([0, 500, 1_000]);
    expect(page.placeExamples).toHaveLength(8);
    expect(page.placesContinue).toBe(true);
    expect(page.placeStep).toBe(10);
    expect(page.bracket.map(({ points }) => points)).toEqual([60, 120]);
    expect(page.finalsGrid).toEqual([
      [36, 27],
      [27, 30],
    ]);
  });

  it('the bracket stages have the names the page marks (R-133 Q2, R-76)', () => {
    expect(
      page.bracket.map(({ stage }) => EUROLEAGUE_STAGE_NAMES[stage]),
    ).toEqual(['Atkrintamosios', 'Finalo ketvertas']);
    expect(EUROLEAGUE_STAGE_NAMES).toEqual({
      place: 'Reguliarus sezonas',
      playOffs: 'Atkrintamosios',
      finalFour: 'Finalo ketvertas',
      final: 'Finalas',
    });
  });

  it('passes the team count and the deadline round through (R-106, R-128, R-133)', () => {
    expect(page.teamCount).toBe(20);
    expect(page.deadlineRound).toBe(5);
  });

  it('with no tournament leaves the team count and the deadline round out', () => {
    const none = rulesPage(rules, null);
    expect(none.teamCount).toBeNull();
    expect(none.deadlineRound).toBeNull();
  });
});

describe('rulesPage: the scoring balance (R-138)', () => {
  it('sportbetRules: 50 - |error|, +20 for the exact difference, +50 Bingo', () => {
    expect(rulesPage(sportbetRules, FACTS).tiles).toMatchObject({
      differenceSlope: 1,
      exactMargin: 20,
      bingo: 50,
    });
  });

  it('ruledRules: 50 - 2 x |error|, +30 for the exact difference, +100 Bingo', () => {
    expect(rulesPage(ruledRules, FACTS).tiles).toMatchObject({
      differenceSlope: 2,
      exactMargin: 30,
      bingo: 100,
    });
  });
});

describe('rulesPage: the rates, the crowd and the switch-off (R-10, R-2, R-7)', () => {
  it('shows sportbet x1 / x2 under sportbetRules', () => {
    expect(rulesPage(sportbetRules, FACTS).tiles.rates).toEqual([1, 2]);
  });

  it('shows the distinct rates in stage order under ruledRules: x1 / x2 / x3 (R-10)', () => {
    expect(rulesPage(ruledRules, FACTS).tiles.rates).toEqual([1, 2, 3]);
  });

  it('says only real predictions count under ruledRules (R-2), not under sportbetRules', () => {
    expect(rulesPage(ruledRules, FACTS).oddsCountRealOnly).toBe(true);
    expect(rulesPage(sportbetRules, FACTS).oddsCountRealOnly).toBe(false);
  });

  it('states the missed games after which a player is switched off (R-7, R-32): 20 under ruledRules, 5 under sportbetRules', () => {
    expect(rulesPage(ruledRules, FACTS).switchOffAfterMisses).toBe(20);
    expect(rulesPage(sportbetRules, FACTS).switchOffAfterMisses).toBe(5);
  });
});

describe('R-100: /rules shows what the new app scores with', () => {
  it('is the sportbet page except where a listed ruling changed a rule', () => {
    const sportbet = leaves(rulesPage(sportbetRules, FACTS), '');
    const ruled = leaves(rulesPage(ruledRules, FACTS), '');
    expect([...ruled.keys()]).toEqual([...sportbet.keys()]);
    const differing = [...ruled.keys()].filter(
      (key) => ruled.get(key) !== sportbet.get(key),
    );
    // R-138 (the margin rule's slope, the bonuses, and the worked margin
    // rows they change: the exact score's bonus, the exact margin's, and
    // the three misses), R-10 (the rates), R-2 (odds count real predictions
    // only), R-7 (the switch-off).
    expect(differing.map((key) => key.replace(/\.\d+$/, ''))).toEqual([
      'tiles.differenceSlope',
      'tiles.bingo',
      'tiles.exactMargin',
      'tiles.rates',
      'marginExamples.0.bonusHundredths',
      'marginExamples.1.bonusHundredths',
      'marginExamples.2.pointsHundredths',
      'marginExamples.3.pointsHundredths',
      'marginExamples.4.pointsHundredths',
      'oddsCountRealOnly',
      'switchOffAfterMisses',
    ]);
  });
});
