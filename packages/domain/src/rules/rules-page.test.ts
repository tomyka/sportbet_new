import { describe, expect, it } from 'vitest';
import { EUROLEAGUE_STAGE_NAMES } from '../summary/standings-summary';
import { ruledRules, sportbetRules, type RuleSet } from './rule-set';
import { rulesPage } from './rules-page';

const FACTS = {
  teamCount: 20,
  deadlineRound: 5,
  standingsCloses: { state: 'open' },
} as const;
const NO_TOURNAMENT = {
  teamCount: null,
  deadlineRound: null,
  standingsCloses: null,
} as const;

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

  it('the tiles: the winner bonus, the margin base, bingo and the exact margin (R-42), serija step 5 (R-106)', () => {
    expect(page.tiles).toMatchObject({
      winnerBonus: 50,
      marginBase: 50,
      bingo: 50,
      exactMargin: 20,
      serijaStep: 5,
    });
  });

  it('the entry bounds are 50 to 120 and a draw is refused', () => {
    expect(page.bounds).toEqual({ min: 50, max: 120, drawsAllowed: false });
  });

  it('the margin examples, as ScoringRules scores them (R-42, MS-6)', () => {
    const shown = page.marginExamples.map(
      ({ predicted, miss, points, bonus, exactScore }) => ({
        call: `${String(predicted.home)}:${String(predicted.away)}`,
        miss,
        points,
        bonus,
        exactScore,
      }),
    );
    expect(page.marginExamples.every(({ actual }) => actual.home === 88)).toBe(
      true,
    );
    expect(page.marginExamples.every(({ actual }) => actual.away === 79)).toBe(
      true,
    );
    expect(shown).toEqual([
      { call: '88:79', miss: 0, points: 50, bonus: 50, exactScore: true },
      { call: '92:83', miss: 0, points: 50, bonus: 20, exactScore: false },
      { call: '85:80', miss: 4, points: 46, bonus: 0, exactScore: false },
      { call: '79:88', miss: 18, points: 32, bonus: 0, exactScore: false },
      { call: '60:115', miss: 64, points: -14, bonus: 0, exactScore: false },
    ]);
  });

  // The oracle: CrowdOdds::stored(CrowdOdds::of(30, n)) and
  // PointsFormat::winnerPoints of sportbet at 1618164, evaluated with PHP.
  it('the odds examples are sportbet: shares 93, 50, 33, 10, 3; odds 0.10, 1.00, 1.59, 3.32, 4.91; winner points 55, 100, 129.5, 216, 295.5', () => {
    expect(
      page.oddsExamples.map(
        ({ chose, total, share, oddsHundredths, winnerPointsHundredths }) => [
          chose,
          total,
          share,
          oddsHundredths,
          winnerPointsHundredths,
        ],
      ),
    ).toEqual([
      [28, 30, 93, 10, 5_500],
      [15, 30, 50, 100, 10_000],
      [10, 30, 33, 159, 12_950],
      [3, 30, 10, 332, 21_600],
      [1, 30, 3, 491, 29_550],
    ]);
  });

  it('the serija rows are +0, +5, +10 and the tile reads +(N-1)x5; a run follows kick-off order (R-106)', () => {
    expect(page.serijaExamples).toEqual([
      { run: 1, bonus: 0 },
      { run: 2, bonus: 5 },
      { run: 3, bonus: 10 },
    ]);
    expect(page.tiles.serijaStep).toBe(5);
    expect(page.serijaOrder).toBe('tip-off');
  });

  it('places miss 0 to 7 pay 190 down to 120, the rule continues, 10 a place', () => {
    expect(page.placeExamples.map(({ miss }) => miss)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(page.placeExamples.map(({ points }) => points)).toEqual([
      190, 180, 170, 160, 150, 140, 130, 120,
    ]);
    expect(page.placeExamples.some(({ last }) => last)).toBe(false);
    expect(page.placesContinue).toBe(true);
    expect(page.placeStep).toBe(10);
  });

  it('the team count is passed through, and kept null with no tournament', () => {
    expect(page.teamCount).toBe(20);
    expect(rulesPage(rules, NO_TOURNAMENT).teamCount).toBeNull();
  });

  it('the bracket pays 60 for 8 teams and 120 for 4, and the finals grid is 36 27 / 27 30', () => {
    expect(page.bracket).toEqual([
      { stage: 'playOffs', points: 60, count: 8 },
      { stage: 'finalFour', points: 120, count: 4 },
    ]);
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

  it('the deadline round and whether it closes are passed through, null kept (R-106, R-128, R-133)', () => {
    expect(page.deadlineRound).toBe(5);
    expect(page.standingsCloses).toEqual({ state: 'open' });
    const never = rulesPage(rules, {
      ...FACTS,
      standingsCloses: { state: 'never' },
    });
    expect(never.deadlineRound).toBe(5);
    expect(never.standingsCloses).toEqual({ state: 'never' });
    const none = rulesPage(rules, NO_TOURNAMENT);
    expect(none.deadlineRound).toBeNull();
    expect(none.standingsCloses).toBeNull();
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
    // R-10 (the rates), R-2 (odds count real predictions only), R-7 (the switch-off).
    expect(differing.map((key) => key.replace(/\.\d+$/, ''))).toEqual([
      'tiles.rates',
      'oddsCountRealOnly',
      'switchOffAfterMisses',
    ]);
  });
});
