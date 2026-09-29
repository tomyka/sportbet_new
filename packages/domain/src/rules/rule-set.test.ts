import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules, type RuleSet } from './rule-set';

// Each key is one difference between sportbet and the owner's rulings, with
// the catalogue rule and the ruling it encodes. Adding a field to RuleSet
// without adding it here (and a test under both sets) fails this file.
const DIFFERENCES: Record<Exclude<keyof RuleSet, 'name'>, string> = {
  movedGameReopens: 'LR-2, R-13',
  currentRound: 'LR-3, R-6, R-40',
  stageRates: 'LR-4, R-10',
  finishedTournamentsFrozen: 'LR-6, R-21, R-22',
  levelResultAllowed: 'MS-10, R-38',
  halfTypedPredictionStored: 'MS-1, MS-2, R-15',
  missingOddsScoreAtOne: 'CO-5',
  crowdOddsCountFilledIn: 'CO-6, R-2, R-9',
  fillInsOfMistakenResultRemoved: 'FI-4, R-5',
  survivalPickLocksAtTipOff: 'SU-4, R-4',
  survivalTeamOncePerRun: 'SU-5, R-11',
  survivalRegularSeasonOnly: 'SU-7, R-10',
  positionsGetCrowdBonus: 'ST-4, R-35',
  standingsBonusPopulation: 'ST-5, ST-7, R-3, R-36',
  placesScoredOnlyFromFinalTable: 'ST-8, R-14',
  everyPageRanksByFullTotal: 'RA-1, R-18',
  tieOrder: 'RA-3, R-30',
  adminHideSeparate: 'RA-4, R-19',
  rankHistoryFromWhenEarned: 'RA-5, R-17',
  switchOff: 'PL-1, R-7',
  registrationClosesAt: 'PL-2, R-8',
  lateJoinersFilledIn: 'PL-2, R-9',
};

describe('RuleSet', () => {
  it('rules: holds exactly the listed differences', () => {
    expect(Object.keys(sportbetRules).sort()).toEqual(
      ['name', ...Object.keys(DIFFERENCES)].sort(),
    );
    expect(Object.keys(ruledRules).sort()).toEqual(
      Object.keys(sportbetRules).sort(),
    );
  });

  it.each(Object.entries(DIFFERENCES))(
    'rules: %s differs between the sets (%s)',
    (key) => {
      const sportbet: unknown = Reflect.get(sportbetRules, key);
      const ruled: unknown = Reflect.get(ruledRules, key);
      expect(ruled).not.toEqual(sportbet);
    },
  );

  it('rules: both sets are frozen, nested values included', () => {
    for (const rules of [sportbetRules, ruledRules]) {
      expect(Object.isFrozen(rules)).toBe(true);
      expect(Object.isFrozen(rules.switchOff)).toBe(true);
      expect(
        rules.stageRates === null || Object.isFrozen(rules.stageRates),
      ).toBe(true);
    }
  });

  it('rules: each set names itself', () => {
    expect(sportbetRules.name).toBe('sportbet');
    expect(ruledRules.name).toBe('ruled');
  });
});
