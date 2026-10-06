import {
  inputReadsOf,
  MatchPrediction,
  ok,
  recalculateTournament,
  refuse,
  ruledRules,
  sportbetRules,
  TeamOutcomes,
  type CrowdOdds,
  type GameId,
  type RuleSet,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  score,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  FIELDS,
  RULINGS,
  rulingLabel,
  rulingsImpact,
  type Effect,
  type InputsUnder,
  type RuleField,
} from './rulings';

const SCORED = new Set([gameNo(1), gameNo(2), gameNo(3)]);

/**
 * The golden inputs as the db reads them under `rules` (inputReadsOf):
 * the stored odds and survival rows where the set reads them, else the
 * votes and the picks; the table final, or not, as the reader loads it.
 */
const golden =
  (tableIsFinal: boolean): InputsUnder =>
  (rules: RuleSet) => {
    const reads = inputReadsOf(rules);
    const inputs = goldenInputs({
      ...(reads.odds === 'stored'
        ? { game_odds: GOLDEN_POINTS.game_odds }
        : {}),
      ...(reads.survival === 'stored-rows'
        ? { point_survivals: GOLDEN_POINTS.point_survivals }
        : {}),
    });
    return Promise.resolve(
      ok({
        ...inputs,
        outcomes: unwrap(
          TeamOutcomes.stored(inputs.outcomes.teams, tableIsFinal),
        ),
      }),
    );
  };

/**
 * The golden inputs with ben's game-1 prediction a fill-in, as production
 * holds fill-ins: its stored odds count it as a vote (sportbet's CO-6), so
 * they agree with the odds from the votes under CO-5 alone.
 */
const withFillIn: InputsUnder = async (rules) => {
  const inputs = unwrap(await golden(true)(rules));
  const ben = NAME_IDS.player('ben');
  const predictions = inputs.predictions.map((prediction) =>
    prediction.player === ben && prediction.game === gameNo(1)
      ? MatchPrediction.fillIn(
          ben,
          gameNo(1),
          score(79, 88),
          'fill-in',
          at('2026-06-15T17:00:00Z'),
        )
      : prediction,
  );
  const stored = unwrap(
    recalculateTournament(
      { ...inputs, predictions, odds: 'from-votes' },
      sportbetRules,
    ),
  ).odds;
  return ok({
    ...inputs,
    predictions,
    odds:
      inputReadsOf(rules).odds === 'stored'
        ? new Map<GameId, CrowdOdds>(
            stored.map(({ game, odds }) => [game, odds]),
          )
        : 'from-votes',
  });
};

const effects = async (inputs: InputsUnder) => {
  const impact = unwrap(await rulingsImpact(inputs, SCORED));
  return {
    fields: Object.fromEntries(
      impact.fields.map(({ field, effect }) => [field, effect]),
    ),
    measuredWith: Object.fromEntries(
      impact.fields.map(({ field, measuredWith }) => [
        field,
        measuredWith?.field ?? null,
      ]),
    ),
    ruled: impact.ruled,
    remainder: impact.remainder,
  };
};

const pointsOf = (effect: Effect | undefined) =>
  effect?.kind === 'changes' ? effect.points : 0;

const NONE = { kind: 'changes', rows: 0, players: 0, points: 0 };

describe('rulingsImpact', () => {
  it("holds exactly RuleSet's 24 fields, no more", () => {
    const fields = Object.keys(sportbetRules).filter(
      (field) => field !== 'name',
    );
    expect(fields).toHaveLength(24);
    expect(Object.keys(RULINGS).toSorted()).toEqual(fields.toSorted());
  });

  /**
   * The fields named after an owner ruling alone. R-50 has no catalogue
   * rule behind it: sportbet never reads `is_public`, so the catalogue,
   * which describes sportbet, has nothing to name.
   */
  const RULING_ONLY: readonly RuleField[] = ['nonPublicTournamentsHidden'];

  it('names every RuleSet field after its catalogue rule and ruling', () => {
    expect(
      FIELDS.filter((field) => !RULING_ONLY.includes(field))
        .map(rulingLabel)
        .filter((label) => !/^[A-Z]{2}-\d+(, [A-Z]{1,2}-\d+)*: \S/.test(label)),
    ).toEqual([]);
    expect(
      RULING_ONLY.map(rulingLabel).filter(
        (label) => !/^R-\d+(, R-\d+)*: \S/.test(label),
      ),
    ).toEqual([]);
  });

  it("attributes the golden scenario's ruled differences to ST-4 and ST-5, one field at a time", async () => {
    const { fields, ruled } = await effects(golden(true));
    expect(fields['positionsGetCrowdBonus']).toEqual({
      kind: 'changes',
      rows: 4,
      players: 1,
      points: -7_600_000,
    });
    expect(fields['standingsBonusPopulation']).toEqual({
      kind: 'changes',
      rows: 1,
      players: 1,
      points: 600_000,
    });
    expect(ruled).toEqual({
      kind: 'changes',
      rows: 4,
      players: 1,
      points: -7_000_000,
    });
  });

  it("reproduces #9's unscored places under R-14 alone, on a table not marked final", async () => {
    const { fields, ruled } = await effects(golden(false));
    // ada's four exact places (380 each) and ben's four near ones (180) pay 0.
    expect(fields['placesScoredOnlyFromFinalTable']).toEqual({
      kind: 'changes',
      rows: 8,
      players: 2,
      points: -22_400_000,
    });
    expect(ruled).toEqual({
      kind: 'changes',
      rows: 8,
      players: 2,
      points: -21_800_000,
    });
  });

  it("measures a field that also acts alone against sportbetRules: ST-6's null stores nothing new where the table has every place", async () => {
    const { fields, measuredWith } = await effects(golden(false));
    // R-14's eight unpaid places would store null under both; that
    // overlap is in rows, not points, so the remainder has none of it.
    expect(fields['unscoredPlaceStoresNull']).toEqual(NONE);
    expect(measuredWith['unscoredPlaceStoresNull']).toBeNull();
  });

  it("attributes a fill-in's odds to CO-6 measured on top of CO-5, though each alone changes nothing", async () => {
    const { fields, measuredWith, remainder } = await effects(withFillIn);
    expect(fields['missingOddsScoreAtOne']).toEqual(NONE);
    expect(measuredWith['crowdOddsCountFilledIn']).toBe(
      'missingOddsScoreAtOne',
    );
    // Without ben's away vote, game 1's home odds fall from log2(3/2), 0.59,
    // to 0: its odds row, and ada's and cai's home calls, 29.50 less each.
    expect(fields['crowdOddsCountFilledIn']).toEqual({
      kind: 'changes',
      rows: 3,
      players: 2,
      points: -590_000,
    });
    expect(remainder).toBe(0);
  });

  it('adds what no single line explains as the remainder: on a table not marked final, ST-4 takes a bonus R-14 already took', async () => {
    const { fields, remainder } = await effects(golden(false));
    expect(fields['positionsGetCrowdBonus']).toEqual({
      kind: 'changes',
      rows: 4,
      players: 1,
      points: -7_600_000,
    });
    expect(remainder).toBe(7_600_000);
  });

  it("sums the lines' points and the remainder to every ruling's at once", async () => {
    for (const inputs of [golden(true), golden(false), withFillIn]) {
      const { fields, ruled, remainder } = await effects(inputs);
      const lines = Object.values(fields).reduce(
        (sum, effect) => sum + pointsOf(effect),
        0,
      );
      expect(lines + (remainder ?? Number.NaN)).toBe(pointsOf(ruled));
    }
  });

  it("reads a prerequisite's inputs once, for its own line and the line on top of it", async () => {
    let reads = 0;
    await rulingsImpact((rules) => {
      reads += 1;
      return golden(true)(rules);
    }, SCORED);
    // sportbetRules, six scoring fields alone, CO-5 with CO-6, ruledRules.
    expect(reads).toBe(9);
  });

  it('names as a prerequisite only a scoring field with none of its own', () => {
    const needing = FIELDS.flatMap((field) => {
      const { needs } = RULINGS[field];
      return needs === null ? [] : [[field, needs] as const];
    });
    expect(needing).toEqual([
      ['crowdOddsCountFilledIn', 'missingOddsScoreAtOne'],
    ]);
    for (const [field, needs] of needing) {
      expect(RULINGS[field].scoring).toBe(true);
      expect(RULINGS[needs]).toMatchObject({ scoring: true, needs: null });
    }
  });

  it('proves each prerequisite real: on its fixture the field alone changes nothing, and on top of its prerequisite it does', async () => {
    const fixtures: Partial<Record<RuleField, InputsUnder>> = {
      crowdOddsCountFilledIn: withFillIn,
    };
    const switched = (...fields: readonly RuleField[]): RuleSet => {
      let rules: RuleSet = sportbetRules;
      for (const field of fields) {
        rules = { ...rules, [field]: ruledRules[field] };
      }
      return rules;
    };
    for (const field of FIELDS) {
      const { needs } = RULINGS[field];
      if (needs === null) continue;
      const fixture = fixtures[field];
      expect({ field, fixture: fixture !== undefined }).toEqual({
        field,
        fixture: true,
      });
      if (fixture === undefined) continue;
      const recalculated = async (rules: RuleSet) =>
        unwrap(recalculateTournament(unwrap(await fixture(rules)), rules));
      expect(await recalculated(switched(field))).toEqual(
        await recalculated(sportbetRules),
      );
      expect(await recalculated(switched(needs, field))).not.toEqual(
        await recalculated(switched(needs)),
      );
    }
  });

  it('reads what each variant reads: odds from the votes and survival from the picks agree with the stored rows here', async () => {
    const { fields } = await effects(golden(true));
    expect([
      fields['missingOddsScoreAtOne'],
      fields['survivalScoredFromStoredRows'],
    ]).toEqual([NONE, NONE]);
  });

  it('lists a field recalculateTournament does not read as changing no stored row', async () => {
    const { fields } = await effects(golden(true));
    expect(fields['movedGameReopens']).toEqual({ kind: 'no-stored-row' });
    expect(
      Object.entries(RULINGS)
        .filter(([, { scoring }]) => scoring)
        .map(([field]) => field),
    ).toEqual([
      'missingOddsScoreAtOne',
      'crowdOddsCountFilledIn',
      'survivalScoredFromStoredRows',
      'positionsGetCrowdBonus',
      'standingsBonusPopulation',
      'placesScoredOnlyFromFinalTable',
      'unscoredPlaceStoresNull',
    ]);
  });

  it('changes no stored row and no total with a field marked non-scoring, each alone, on either table', async () => {
    const recalculated = async (rules: RuleSet, tableIsFinal: boolean) =>
      unwrap(
        recalculateTournament(unwrap(await golden(tableIsFinal)(rules)), rules),
      );
    const nonScoring = Object.keys(sportbetRules)
      .filter((field): field is RuleField => field in RULINGS)
      .filter((field) => !RULINGS[field].scoring);
    // Which fields score is pinned above; here, only that some do not.
    expect(nonScoring.length).toBeGreaterThan(0);
    for (const tableIsFinal of [true, false]) {
      const base = await recalculated(sportbetRules, tableIsFinal);
      for (const field of nonScoring) {
        const variant: RuleSet = {
          ...sportbetRules,
          [field]: ruledRules[field],
        };
        expect({
          field,
          points: await recalculated(variant, tableIsFinal),
        }).toEqual({ field, points: base });
      }
    }
  });

  it('reports a variant whose inputs cannot be read as refused, and the rest as usual', async () => {
    const picksRefused: InputsUnder = (rules) =>
      inputReadsOf(rules).survival === 'picks'
        ? Promise.resolve(refuse('row-of-player-not-in-tournament'))
        : golden(true)(rules);
    const impact = unwrap(await rulingsImpact(picksRefused, SCORED));
    expect(
      impact.fields.find(
        ({ field }) => field === 'survivalScoredFromStoredRows',
      )?.effect,
    ).toEqual({ kind: 'refused', refusal: 'row-of-player-not-in-tournament' });
    expect(impact.ruled).toEqual({
      kind: 'refused',
      refusal: 'row-of-player-not-in-tournament',
    });
    expect(impact.remainder).toBeNull();
  });

  it('is refused when the sportbet inputs cannot be read', async () => {
    expect(
      await rulingsImpact(
        () => Promise.resolve(refuse('row-of-player-not-in-tournament')),
        SCORED,
      ),
    ).toEqual({ ok: false, refusal: 'row-of-player-not-in-tournament' });
  });
});
