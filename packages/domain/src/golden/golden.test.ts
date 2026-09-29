import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  goldenInputs,
  goldenSnapshot,
  type GoldenSnapshot,
} from './golden-scenario';

// The 25 Euroleague entries of sportbet's tests/Fixtures/golden-points.json
// at 0da316f, copied exactly: 9 point_results, 8 point_standings, 5
// point_survivals and 3 game_odds.
const results = (
  winner: string,
  margin: string,
  bingo: string,
  full: string,
  odds: string,
  streak: string,
) => ({
  winner_points: winner,
  difference_points: margin,
  bingo_points: bingo,
  odds_points: '0.0000',
  full_points: full,
  odds,
  streak_bonus: streak,
});
const standings = (
  place: [string, string | null],
  playOffs: [string, string | null],
) => ({
  group_position_points: place[0],
  group_position_odds: place[1],
  quarterfinal_points: playOffs[0],
  quarterfinal_odds: playOffs[1],
  semifinal_points: null,
  semifinal_odds: null,
  final_points: null,
  final_odds: null,
  last16_points: null,
  last16_odds: null,
  last32_points: null,
  last32_odds: null,
});

const SPORTBET: GoldenSnapshot = {
  point_results: {
    'ada / EL h1': results(
      '79.5000',
      '46.0000',
      '0.0000',
      '125.5000',
      '0.5900',
      '0.0000',
    ),
    'ada / EL h2': results(
      '0.0000',
      '-45.0000',
      '0.0000',
      '-45.0000',
      '1.5900',
      '0.0000',
    ),
    'ada / EL h3': results(
      '79.5000',
      '50.0000',
      '20.0000',
      '149.5000',
      '0.5900',
      '0.0000',
    ),
    'ben / EL h1': results(
      '0.0000',
      '32.0000',
      '0.0000',
      '32.0000',
      '1.5900',
      '0.0000',
    ),
    'ben / EL h2': results(
      '79.5000',
      '35.0000',
      '0.0000',
      '114.5000',
      '0.5900',
      '0.0000',
    ),
    'ben / EL h3': results(
      '0.0000',
      '40.0000',
      '0.0000',
      '40.0000',
      '0.0000',
      '0.0000',
    ),
    'cai / EL h1': results(
      '79.5000',
      '49.0000',
      '0.0000',
      '128.5000',
      '0.5900',
      '0.0000',
    ),
    'cai / EL h2': results(
      '79.5000',
      '40.0000',
      '0.0000',
      '119.5000',
      '0.5900',
      '10.0000',
    ),
    'cai / EL h3': results(
      '79.5000',
      '40.0000',
      '0.0000',
      '119.5000',
      '0.5900',
      '20.0000',
    ),
  },
  point_standings: {
    'ada / ZAL': standings(['380.0000', '1.0000'], ['60.0000', '0.0000']),
    'ada / OLY': standings(['380.0000', '1.0000'], ['60.0000', '0.0000']),
    'ada / REA': standings(['380.0000', '1.0000'], ['0.0000', null]),
    'ada / FEN': standings(['380.0000', '1.0000'], ['0.0000', null]),
    'ben / ZAL': standings(['180.0000', null], ['60.0000', '0.0000']),
    'ben / OLY': standings(['180.0000', null], ['0.0000', null]),
    'ben / REA': standings(['180.0000', null], ['0.0000', null]),
    'ben / FEN': standings(['180.0000', null], ['0.0000', null]),
  },
  point_survivals: {
    'ada / EL E1': { survival_points: '12.0000', team_id: 'FEN' },
    'ada / EL E2': { survival_points: '22.0000', team_id: 'ZAL' },
    'ben / EL E1': { survival_points: '12.0000', team_id: 'FEN' },
    'dan / EL E1': { survival_points: '12.0000', team_id: 'FEN' },
    'dan / EL E2': { survival_points: '22.0000', team_id: 'ZAL' },
  },
  game_odds: {
    'EL h1': { home_odds: '0.5900', away_odds: '1.5900', draw_odds: '2.5900' },
    'EL h2': { home_odds: '1.5900', away_odds: '0.5900', draw_odds: '2.5900' },
    'EL h3': { home_odds: '0.5900', away_odds: '1.5900', draw_odds: '2.5900' },
  },
};

const entries = (snapshot: GoldenSnapshot) =>
  Object.keys(snapshot.point_results).length +
  Object.keys(snapshot.point_standings).length +
  Object.keys(snapshot.point_survivals).length +
  Object.keys(snapshot.game_odds).length;

describe('golden master (sportbet)', () => {
  const snapshot = goldenSnapshot(sportbetRules);

  it('golden: holds the 25 Euroleague entries', () => {
    expect(entries(SPORTBET)).toBe(25);
    expect(entries(snapshot)).toBe(25);
  });

  it('golden: reproduces every match points row', () => {
    expect(snapshot.point_results).toEqual(SPORTBET.point_results);
  });

  it('golden: reproduces every standings row', () => {
    expect(snapshot.point_standings).toEqual(SPORTBET.point_standings);
  });

  it('golden: reproduces every survival row', () => {
    expect(snapshot.point_survivals).toEqual(SPORTBET.point_survivals);
  });

  it('golden: reproduces every game odds row', () => {
    expect(snapshot.game_odds).toEqual(SPORTBET.game_odds);
  });

  it('golden: the stored odds and survival rows recalculate to themselves (CO-7, SU-10)', () => {
    // What the parity checker does with production: read the stored odds
    // and survival rows back, recalculate, and get every row it read.
    const stored = goldenInputs({
      game_odds: SPORTBET.game_odds,
      point_survivals: SPORTBET.point_survivals,
    });
    expect(goldenSnapshot(sportbetRules, stored)).toEqual(SPORTBET);
  });
});

describe('golden master (ruled)', () => {
  it('golden (ruled): differs from sportbet exactly where the rulings say', () => {
    const differences = {
      // ST-5, R-3, R-36: both standings players count, so ada's play-off
      // tick on Olympiacos (ticked by her alone) pays 60 x (1 + log2(2/1)).
      'ada / OLY': {
        quarterfinal_points: '120.0000',
        quarterfinal_odds: '1.0000',
      },
    };
    // Survival does not move: the pick-history fold agrees with sportbet's
    // refold of its result-entry rows here (SU-10, R-5).
    // ST-4, R-35: positions get no crowd bonus, so ada's four exact places
    // pay the flat 190 with no odds.
    const flatPlace = {
      group_position_points: '190.0000',
      group_position_odds: null,
    };
    const expected: GoldenSnapshot = {
      ...SPORTBET,
      point_standings: Object.fromEntries(
        Object.entries(SPORTBET.point_standings).map(([key, row]) => [
          key,
          {
            ...row,
            ...(key.startsWith('ada / ') ? flatPlace : {}),
            ...(key === 'ada / OLY' ? differences['ada / OLY'] : {}),
          },
        ]),
      ),
    };
    expect(goldenSnapshot(ruledRules)).toEqual(expected);
  });
});
