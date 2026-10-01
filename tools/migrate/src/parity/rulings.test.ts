import {
  inputReadsOf,
  ok,
  recalculateTournament,
  refuse,
  ruledRules,
  sportbetRules,
  TeamOutcomes,
  type RuleSet,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN_POINTS,
  goldenInputs,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  RULINGS,
  rulingsImpact,
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

const effects = async (tableIsFinal: boolean) => {
  const impact = unwrap(await rulingsImpact(golden(tableIsFinal), SCORED));
  return {
    fields: Object.fromEntries(
      impact.fields.map(({ field, effect }) => [field, effect]),
    ),
    ruled: impact.ruled,
  };
};

const NONE = { kind: 'changes', rows: 0, players: 0, points: 0 };

describe('rulingsImpact', () => {
  it("holds exactly RuleSet's 24 fields, no more", () => {
    const fields = Object.keys(sportbetRules).filter(
      (field) => field !== 'name',
    );
    expect(fields).toHaveLength(24);
    expect(Object.keys(RULINGS).toSorted()).toEqual(fields.toSorted());
  });

  it('names every RuleSet field after its catalogue rule and ruling', () => {
    expect(
      Object.values(RULINGS).filter(
        ({ label }) => !/^[A-Z]{2}-\d+[,:]/.test(label),
      ),
    ).toEqual([]);
  });

  it("attributes the golden scenario's ruled differences to ST-4 and ST-5, one field at a time", async () => {
    const { fields, ruled } = await effects(true);
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
    const { fields, ruled } = await effects(false);
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

  it('shows a field whose effect needs another only in the whole: an unscored place stores null only under R-14', async () => {
    const { fields } = await effects(false);
    expect(fields['unscoredPlaceStoresNull']).toEqual(NONE);
  });

  it('reads what each variant reads: odds from the votes and survival from the picks agree with the stored rows here', async () => {
    const { fields } = await effects(true);
    expect([
      fields['missingOddsScoreAtOne'],
      fields['survivalScoredFromStoredRows'],
    ]).toEqual([NONE, NONE]);
  });

  it('lists a field recalculateTournament does not read as changing no stored row', async () => {
    const { fields } = await effects(true);
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
