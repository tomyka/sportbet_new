import { describe, expect, it } from 'vitest';
import { ruledRules } from '../rules/rule-set';
import { goldenInputs } from './golden-inputs';
import { GOLDEN_POINTS_RULED } from './golden-scenario';
import { goldenSnapshot, snapshotEntries } from './golden-snapshot';

describe('golden master (ruled)', () => {
  it('golden (ruled): holds the 25 Euroleague entries', () => {
    expect(snapshotEntries(GOLDEN_POINTS_RULED)).toBe(25);
    expect(snapshotEntries(goldenSnapshot(ruledRules))).toBe(25);
  });

  it('golden (ruled): the recalculation reproduces every stored row', () => {
    expect(goldenSnapshot(ruledRules)).toEqual(GOLDEN_POINTS_RULED);
  });

  it('golden (ruled, R-138): the survival rows and the margin and bingo points are the doubled ones', () => {
    expect(
      Object.values(GOLDEN_POINTS_RULED.point_survivals).map(
        (row) => row['survival_points'],
      ),
    ).toEqual(['24.0000', '44.0000', '24.0000', '24.0000', '44.0000']);
    expect(GOLDEN_POINTS_RULED.point_results['ada / EL h3']).toMatchObject({
      difference_points: '50.0000',
      bingo_points: '100.0000',
    });
    expect(GOLDEN_POINTS_RULED.point_results['cai / EL h3']).toMatchObject({
      difference_points: '80.0000',
    });
  });

  it("golden (ruled): ada's exact places pay the flat 190 with no odds, her play-off tick on Olympiacos 120", () => {
    expect(GOLDEN_POINTS_RULED.point_standings['ada / OLY']).toMatchObject({
      group_position_points: '190.0000',
      group_position_odds: null,
      quarterfinal_points: '120.0000',
      quarterfinal_odds: '1.0000',
    });
  });

  it('golden (ruled): the stored odds recalculate to themselves (CO-7, R-99)', () => {
    const stored = goldenInputs({ game_odds: GOLDEN_POINTS_RULED.game_odds });
    expect(goldenSnapshot(ruledRules, stored)).toEqual(GOLDEN_POINTS_RULED);
  });
});
