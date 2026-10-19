import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { goldenInputs } from './golden-inputs';
import { GOLDEN_POINTS, GOLDEN_POINTS_RULED } from './golden-scenario';
import { goldenSnapshot, snapshotEntries } from './golden-snapshot';

describe('golden master (sportbet)', () => {
  const snapshot = goldenSnapshot(sportbetRules);

  it('golden: holds the 25 Euroleague entries', () => {
    expect(snapshotEntries(GOLDEN_POINTS)).toBe(25);
    expect(snapshotEntries(snapshot)).toBe(25);
  });

  it('golden: reproduces every match points row', () => {
    expect(snapshot.point_results).toEqual(GOLDEN_POINTS.point_results);
  });

  it('golden: reproduces every standings row', () => {
    expect(snapshot.point_standings).toEqual(GOLDEN_POINTS.point_standings);
  });

  it('golden: reproduces every survival row', () => {
    expect(snapshot.point_survivals).toEqual(GOLDEN_POINTS.point_survivals);
  });

  it('golden: reproduces every game odds row', () => {
    expect(snapshot.game_odds).toEqual(GOLDEN_POINTS.game_odds);
  });

  it('golden: the stored odds and survival rows recalculate to themselves (CO-7, SU-10)', () => {
    // What the parity checker does with production: read the stored odds
    // and survival rows back, recalculate, and get every row it read.
    const stored = goldenInputs({
      game_odds: GOLDEN_POINTS.game_odds,
      point_survivals: GOLDEN_POINTS.point_survivals,
    });
    expect(goldenSnapshot(sportbetRules, stored)).toEqual(GOLDEN_POINTS);
  });
});

describe('golden master (ruled)', () => {
  it('golden (ruled): differs from sportbet exactly where the rulings say', () => {
    expect(goldenSnapshot(ruledRules)).toEqual(GOLDEN_POINTS_RULED);
  });

  it('golden (ruled, R-138): the winner points, odds and streak do not move; the margin, bingo and survival rows do', () => {
    const unmoved = ['winner_points', 'odds', 'streak_bonus'];
    for (const [key, ruled] of Object.entries(
      GOLDEN_POINTS_RULED.point_results,
    )) {
      const sportbet = GOLDEN_POINTS.point_results[key] ?? {};
      for (const column of unmoved) {
        expect(ruled[column]).toBe(sportbet[column]);
      }
    }
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

  it("golden (ruled): only ada's four standings rows change", () => {
    const changed = Object.keys(GOLDEN_POINTS.point_standings).filter(
      (key) =>
        JSON.stringify(GOLDEN_POINTS.point_standings[key]) !==
        JSON.stringify(GOLDEN_POINTS_RULED.point_standings[key]),
    );
    expect(changed).toEqual([
      'ada / ZAL',
      'ada / OLY',
      'ada / REA',
      'ada / FEN',
    ]);
    expect(GOLDEN_POINTS_RULED.point_standings['ada / OLY']).toMatchObject({
      group_position_points: '190.0000',
      group_position_odds: null,
      quarterfinal_points: '120.0000',
      quarterfinal_odds: '1.0000',
    });
  });
});
