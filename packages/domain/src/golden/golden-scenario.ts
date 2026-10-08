// sportbet's golden scenario (tests/Support/GoldenScenario.php at 3eb95e7),
// its Euroleague part as raw rows (GOLDEN), the 25 Euroleague entries of
// sportbet's tests/Fixtures/golden-points.json (GOLDEN_POINTS) and the
// differences the rulings make to them (GOLDEN_POINTS_RULED); the domain
// inputs and snapshot built from them are golden-inputs.ts and
// golden-snapshot.ts. Test support: the test entry
// (src/testing.ts) exports it, so the domain's golden test, the db suite
// and the reader's synthetic dump share one copy; index.ts does not. It uses
// no test helpers, because lint keeps runtime-looking files off `testing`.
//
// Tournaments are kept apart, so the football part of the scenario only
// proves that independence and is left out (catalogue, golden master
// mapping).

import {
  gameId,
  playerId,
  teamId,
  type GameId,
  type PlayerId,
  type TeamId,
} from '../shared/ids';
import type { Result } from '../shared/result';

/** A value the scenario's own data must give: a refusal is a broken scenario. */
export function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`golden scenario refused: ${result.refusal}`);
  return result.value;
}

export type Name = 'ada' | 'ben' | 'cai' | 'dan';
export type TeamName = 'ZAL' | 'OLY' | 'REA' | 'FEN';

export interface GoldenGame {
  readonly id: 1 | 2 | 3;
  readonly round: 1 | 2;
  readonly home: TeamName;
  readonly away: TeamName;
  readonly tipOff: string;
  readonly result: readonly [number, number];
}

/** One saved standings row; a column not named was never saved (null). */
export interface GoldenStandingsRow {
  readonly team: TeamName;
  readonly place: number;
  readonly playOffs: boolean | null;
}

/**
 * The Euroleague part of sportbet's golden scenario, as the rows it stores
 * (GoldenScenario::euroleague). Names stand for ids: each consumer gives
 * them its own (GoldenIds).
 */
export const GOLDEN = Object.freeze({
  /** dan has no match predictions and no standings, only survival picks. */
  players: ['ada', 'ben', 'cai', 'dan'] as const satisfies readonly Name[],
  teams: ['ZAL', 'OLY', 'REA', 'FEN'] as const satisfies readonly TeamName[],
  /** Rate 1 and survival on; E2 is flagged knockout (MS-8). */
  rounds: [
    { number: 1, name: 'EL E1', knockout: false },
    { number: 2, name: 'EL E2', knockout: true },
  ] as const,
  /** The day after it is when the season ends. */
  endsOn: '2026-06-29',
  games: [
    {
      id: 1,
      round: 1,
      home: 'ZAL',
      away: 'OLY',
      tipOff: '2026-06-15T18:00:00Z',
      result: [88, 79],
    },
    {
      id: 2,
      round: 1,
      home: 'REA',
      away: 'FEN',
      tipOff: '2026-06-15T20:00:00Z',
      result: [70, 95],
    },
    {
      id: 3,
      round: 2,
      home: 'ZAL',
      away: 'FEN',
      tipOff: '2026-06-20T18:00:00Z',
      result: [90, 85],
    },
  ] as const satisfies readonly GoldenGame[],
  /** All real, none blank, so nobody is filled in. */
  predictions: [
    ['ada', 1, 85, 80],
    ['ada', 2, 120, 50],
    ['ada', 3, 90, 85],
    ['ben', 1, 79, 88],
    ['ben', 2, 80, 90],
    ['ben', 3, 85, 90],
    ['cai', 1, 90, 80],
    ['cai', 2, 75, 90],
    // The exact margin (5) without the exact score: the +20 of R-42. It was
    // 95-80 until sportbet 1ac955f; still a home call, so the crowd odds and
    // cai's serija are unchanged.
    ['cai', 3, 95, 90],
  ] as const satisfies readonly (readonly [Name, 1 | 2 | 3, number, number])[],
  standings: [
    [
      'ada',
      [
        { team: 'ZAL', place: 1, playOffs: true },
        { team: 'OLY', place: 2, playOffs: true },
        { team: 'REA', place: 3, playOffs: null },
        { team: 'FEN', place: 4, playOffs: null },
      ],
    ],
    [
      'ben',
      [
        { team: 'ZAL', place: 2, playOffs: true },
        { team: 'OLY', place: 1, playOffs: null },
        { team: 'REA', place: 4, playOffs: true },
        { team: 'FEN', place: 3, playOffs: null },
      ],
    ],
  ] as const satisfies readonly (readonly [
    Name,
    readonly GoldenStandingsRow[],
  ])[],
  /** The table and play-off ticks as entered; no Final Four, no final. */
  outcomes: [
    { team: 'ZAL', place: 1, playOffs: true },
    { team: 'OLY', place: 2, playOffs: true },
    { team: 'REA', place: 3, playOffs: false },
    { team: 'FEN', place: 4, playOffs: false },
  ] as const,
  /** The table was entered after the last round: it is final. */
  tableIsFinal: true,
  /** Set directly, not through the lock. */
  survival: [
    [
      'ada',
      [
        [1, 'FEN'],
        [2, 'ZAL'],
      ],
    ],
    ['ben', [[1, 'FEN']]],
    [
      'dan',
      [
        [1, 'FEN'],
        [2, 'ZAL'],
      ],
    ],
  ] as const satisfies readonly (readonly [
    Name,
    readonly (readonly [1 | 2, TeamName])[],
  ])[],
});

export interface GoldenSnapshot {
  readonly point_results: Record<string, Record<string, string>>;
  readonly point_standings: Record<string, Record<string, string | null>>;
  readonly point_survivals: Record<string, Record<string, string>>;
  readonly game_odds: Record<string, Record<string, string>>;
}

/** A point_results row's six columns, in golden-points.json's order. */
const results = ([winner, margin, bingo, full, odds, streak]: readonly [
  winner: string,
  margin: string,
  bingo: string,
  full: string,
  odds: string,
  streak: string,
]) => ({
  winner_points: winner,
  difference_points: margin,
  bingo_points: bingo,
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

/**
 * The 25 Euroleague entries of sportbet's tests/Fixtures/golden-points.json
 * at 3eb95e7, copied exactly: 9 point_results, 8 point_standings, 5
 * point_survivals and 3 game_odds.
 */
export const GOLDEN_POINTS: GoldenSnapshot = Object.freeze({
  point_results: {
    'ada / EL h1': results([
      '79.5000',
      '46.0000',
      '0.0000',
      '125.5000',
      '0.5900',
      '0.0000',
    ]),
    'ada / EL h2': results([
      '0.0000',
      '-45.0000',
      '0.0000',
      '-45.0000',
      '1.5900',
      '0.0000',
    ]),
    'ada / EL h3': results([
      '79.5000',
      '50.0000',
      '50.0000',
      '179.5000',
      '0.5900',
      '0.0000',
    ]),
    'ben / EL h1': results([
      '0.0000',
      '32.0000',
      '0.0000',
      '32.0000',
      '1.5900',
      '0.0000',
    ]),
    'ben / EL h2': results([
      '79.5000',
      '35.0000',
      '0.0000',
      '114.5000',
      '0.5900',
      '0.0000',
    ]),
    'ben / EL h3': results([
      '0.0000',
      '40.0000',
      '0.0000',
      '40.0000',
      '0.0000',
      '0.0000',
    ]),
    'cai / EL h1': results([
      '79.5000',
      '49.0000',
      '0.0000',
      '128.5000',
      '0.5900',
      '0.0000',
    ]),
    'cai / EL h2': results([
      '79.5000',
      '40.0000',
      '0.0000',
      '119.5000',
      '0.5900',
      '10.0000',
    ]),
    'cai / EL h3': results([
      '79.5000',
      '70.0000',
      '0.0000',
      '149.5000',
      '0.5900',
      '20.0000',
    ]),
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
});

/**
 * What the ruled set derives instead: four standings entries change, all
 * of ada's, five values in all (catalogue, golden master). ST-4, R-35: positions get no crowd
 * bonus, so ada's four exact places pay the flat 190 with no odds. ST-5,
 * R-3, R-36: both standings players count, so ada's play-off tick on
 * Olympiacos (ticked by her alone) pays 60 x (1 + log2(2/1)). Survival does
 * not move: the pick-history fold agrees with sportbet's refold of its
 * result-entry rows here (SU-10, R-5).
 */
export const GOLDEN_POINTS_RULED: GoldenSnapshot = Object.freeze({
  ...GOLDEN_POINTS,
  point_standings: Object.fromEntries(
    Object.entries(GOLDEN_POINTS.point_standings).map(([key, row]) => [
      key,
      {
        ...row,
        ...(key.startsWith('ada / ')
          ? { group_position_points: '190.0000', group_position_odds: null }
          : {}),
        ...(key === 'ada / OLY'
          ? { quarterfinal_points: '120.0000', quarterfinal_odds: '1.0000' }
          : {}),
      },
    ]),
  ),
});

/**
 * The ids a consumer gives the scenario's names: the domain's own tests use
 * the names themselves (NAME_IDS); a database needs numbers.
 */
export interface GoldenIds {
  readonly player: (name: Name) => PlayerId;
  readonly team: (name: TeamName) => TeamId;
  readonly game: (id: 1 | 2 | 3) => GameId;
}

/** Each name as its own id, and each game as its golden number. */
export const NAME_IDS: GoldenIds = Object.freeze({
  player: (name: Name) => must(playerId(name)),
  team: (name: TeamName) => must(teamId(name)),
  game: (id: 1 | 2 | 3) => must(gameId(id)),
});

/**
 * Rows a golden snapshot holds, read back as the full recalculation reads
 * production's: the stored odds (CO-7) and the stored survival rows
 * (SU-10), in place of computing them from the votes and the picks.
 */
export interface GoldenStoredRows {
  readonly game_odds?: GoldenSnapshot['game_odds'];
  readonly point_survivals?: GoldenSnapshot['point_survivals'];
}
