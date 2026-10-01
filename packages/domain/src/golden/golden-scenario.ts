// sportbet's golden scenario (tests/Support/GoldenScenario.php at 1ac955f),
// its Euroleague part as raw rows (GOLDEN), the 25 Euroleague entries of
// sportbet's tests/Fixtures/golden-points.json (GOLDEN_POINTS), the
// differences the rulings make to them (GOLDEN_POINTS_RULED), and the
// domain inputs and snapshot built from them. Test support: the test entry
// (src/testing.ts) exports it, so the domain's golden test, the db suite
// and the reader's synthetic dump share one copy; index.ts does not. It uses
// no test helpers, because lint keeps runtime-looking files off `testing`.
//
// Tournaments are kept apart, so the football part of the scenario only
// proves that independence and is left out (catalogue, golden master
// mapping).

import { CrowdOdds } from '../odds/crowd-odds';
import { Odds, type StandingsOdds } from '../points/odds';
import { Points } from '../points/points';
import type { StandingsPoints } from '../points/standings-points';
import { MatchPrediction } from '../prediction/match-prediction';
import {
  recalculateTournament,
  type PointsRows,
  type StoredSurvivalRow,
  type TournamentInputs,
} from '../recalculation/recalculation';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import {
  gameId,
  playerId,
  roundNumber,
  teamId,
  type GameId,
  type PlayerId,
  type TeamId,
} from '../shared/ids';
import { dayAfter, instantFrom } from '../shared/instant';
import type { Result } from '../shared/result';
import { Rate, Score } from '../score/score';
import {
  StandingsPrediction,
  type StoredTeamPick,
} from '../standings/standings-prediction';
import type { StandingsLine } from '../standings/standings-scoring';
import { TeamOutcomes } from '../standings/team-outcomes';
import { SurvivalRun } from '../survival/survival-run';

function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`golden scenario refused: ${result.refusal}`);
  return result.value;
}

type Name = 'ada' | 'ben' | 'cai' | 'dan';
type TeamName = 'ZAL' | 'OLY' | 'REA' | 'FEN';

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

/**
 * The 25 Euroleague entries of sportbet's tests/Fixtures/golden-points.json
 * at 1ac955f, copied exactly: 9 point_results, 8 point_standings, 5
 * point_survivals and 3 game_odds.
 */
export const GOLDEN_POINTS: GoldenSnapshot = Object.freeze({
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
      '50.0000',
      '179.5000',
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
      '70.0000',
      '0.0000',
      '149.5000',
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

/** A non-negative "12.0000" or "0.5900" as hundredths, exactly. */
const hundredths = (fourPlaces: string | undefined): number => {
  const match = /^(\d+)\.(\d{2})00$/.exec(fourPlaces ?? '');
  if (match === null)
    throw new Error(`golden: bad column ${String(fourPlaces)}`);
  return Number(match[1]) * 100 + Number(match[2]);
};

/** "EL h2" as the golden game 2. */
const goldenGame = (key: string): 1 | 2 | 3 => {
  const found = GOLDEN.games.find(({ id }) => key === `EL h${String(id)}`);
  if (found === undefined) throw new Error(`golden: bad game key ${key}`);
  return found.id;
};

const nameOf = <N extends string>(names: readonly N[], value: string): N => {
  const found = names.find((name) => name === value);
  if (found === undefined) throw new Error(`golden: unknown name ${value}`);
  return found;
};

/** The stored odds rows of a snapshot, keyed by the consumer's game ids. */
export function goldenOdds(
  rows: GoldenSnapshot['game_odds'],
  ids: GoldenIds = NAME_IDS,
): ReadonlyMap<GameId, CrowdOdds> {
  return new Map(
    Object.entries(rows).map(([key, odds]) => [
      ids.game(goldenGame(key)),
      CrowdOdds.stored(
        must(Odds.ofHundredths(hundredths(odds['home_odds']))),
        must(Odds.ofHundredths(hundredths(odds['away_odds']))),
        must(Odds.ofHundredths(hundredths(odds['draw_odds']))),
      ),
    ]),
  );
}

/**
 * The stored survival rows of a snapshot, numbered from 1 in key order, as
 * the consumer's ids.
 */
export function goldenSurvivalRows(
  rows: GoldenSnapshot['point_survivals'],
  ids: GoldenIds = NAME_IDS,
): StoredSurvivalRow[] {
  return Object.entries(rows).map(([key, stored], index) => {
    const [name, round] = key.split(' / EL E');
    if (name === undefined || round === undefined) {
      throw new Error(`golden: bad survival key ${key}`);
    }
    return {
      id: index + 1,
      player: ids.player(nameOf(GOLDEN.players, name)),
      round: must(roundNumber(Number(round))),
      team: ids.team(nameOf(GOLDEN.teams, stored['team_id'] ?? '')),
      storedPoints: must(
        Points.ofHundredths(hundredths(stored['survival_points'])),
      ),
    };
  });
}

/**
 * The golden tournament's inputs, built from its stored rows. The odds come
 * from the votes and survival from the pick history, as result entry makes
 * them, unless `stored` gives the rows a full recalculation reads instead.
 */
export function goldenInputs(
  stored: GoldenStoredRows = {},
  ids: GoldenIds = NAME_IDS,
): TournamentInputs {
  const rounds = GOLDEN.rounds.map((round) =>
    Round.stored({
      number: must(roundNumber(round.number)),
      stage: 'regular',
      rate: Rate.ONE,
      survival: true,
      knockout: round.knockout,
    }),
  );
  const games = GOLDEN.games.map((spec) =>
    must(
      Game.stored({
        id: ids.game(spec.id),
        round: must(roundNumber(spec.round)),
        home: ids.team(spec.home),
        away: ids.team(spec.away),
        tipOff: must(instantFrom(spec.tipOff)),
        result: must(Score.of(spec.result[0], spec.result[1])),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  );
  const season = must(
    Season.create({ rounds, games, endsAt: must(dayAfter(GOLDEN.endsOn)) }),
  );
  const pick = (row: GoldenStandingsRow): StoredTeamPick => ({
    team: ids.team(row.team),
    place: row.place,
    playOffs: row.playOffs,
    finalFour: null,
    finalPlace: null,
  });

  return {
    season,
    players: GOLDEN.players.map((name) => ids.player(name)),
    predictions: GOLDEN.predictions.map(([name, game, home, away]) =>
      must(
        MatchPrediction.stored({
          player: ids.player(name),
          game: ids.game(game),
          home,
          away,
          origin: 'real',
          filledInAt: null,
        }),
      ),
    ),
    odds:
      stored.game_odds === undefined
        ? 'from-votes'
        : goldenOdds(stored.game_odds, ids),
    survival:
      stored.point_survivals === undefined
        ? {
            from: 'picks',
            runs: new Map(
              GOLDEN.survival.map(([name, picks]): [PlayerId, SurvivalRun] => [
                ids.player(name),
                must(
                  SurvivalRun.stored(
                    picks.map(([round, team]) => ({
                      round: must(roundNumber(round)),
                      team: ids.team(team),
                    })),
                  ),
                ),
              ]),
            ),
          }
        : {
            from: 'stored-rows',
            rows: goldenSurvivalRows(stored.point_survivals, ids),
          },
    standings: GOLDEN.standings.map(([name, rows]) =>
      must(StandingsPrediction.stored(ids.player(name), rows.map(pick))),
    ),
    outcomes: must(
      TeamOutcomes.stored(
        GOLDEN.outcomes.map((outcome) => ({
          team: ids.team(outcome.team),
          place: outcome.place,
          playOffs: outcome.playOffs,
          finalFour: false,
          finalPlace: null,
        })),
        GOLDEN.tableIsFinal,
      ),
    ),
  };
}

const four = (twoPlaces: { toString(): string }) => `${twoPlaces.toString()}00`;
const line = (value: StandingsPoints | StandingsOdds | null) =>
  value === null ? null : value.toString();
const columns = (name: string, standings: StandingsLine) => ({
  [`${name}_points`]: line(standings.points),
  [`${name}_odds`]: line(standings.odds),
});

/**
 * Stored points rows in golden-points.json's shape, each key and team named
 * back from the consumer's ids.
 */
export function snapshotOf(
  points: PointsRows,
  ids: GoldenIds = NAME_IDS,
): GoldenSnapshot {
  const playerName = new Map(
    GOLDEN.players.map((name) => [ids.player(name), name]),
  );
  const teamName = new Map(GOLDEN.teams.map((name) => [ids.team(name), name]));
  const gameName = new Map(
    GOLDEN.games.map(({ id }) => [ids.game(id), `EL h${String(id)}`]),
  );
  const named = <K, V>(names: ReadonlyMap<K, V>, key: K): V => {
    const name = names.get(key);
    if (name === undefined)
      throw new Error(`golden: no name for ${String(key)}`);
    return name;
  };
  const snapshot: GoldenSnapshot = {
    point_results: {},
    point_standings: {},
    point_survivals: {},
    game_odds: {},
  };
  for (const { game, odds } of points.odds) {
    snapshot.game_odds[named(gameName, game)] = {
      home_odds: four(odds.home),
      away_odds: four(odds.away),
      draw_odds: four(odds.draw),
    };
  }
  for (const { player, game, points: match, serija } of points.matches) {
    snapshot.point_results[
      `${named(playerName, player)} / ${named(gameName, game)}`
    ] = {
      winner_points: four(match.winner),
      difference_points: four(match.margin),
      bingo_points: four(match.bingo),
      odds_points: four(match.oddsPoints),
      full_points: four(match.full),
      odds: four(match.odds),
      streak_bonus: four(serija),
    };
  }
  // Euroleague plays no last 16 or last 32: always null.
  for (const team of points.standings) {
    snapshot.point_standings[
      `${named(playerName, team.player)} / ${named(teamName, team.team)}`
    ] = {
      ...columns('group_position', team.place),
      ...columns('quarterfinal', team.playOffs),
      ...columns('semifinal', team.finalFour),
      ...columns('final', team.final),
      last16_points: null,
      last16_odds: null,
      last32_points: null,
      last32_odds: null,
    };
  }
  for (const survival of points.survival) {
    snapshot.point_survivals[
      `${named(playerName, survival.player)} / EL E${String(survival.round)}`
    ] = {
      survival_points:
        survival.points === null ? 'pending' : four(survival.points),
      team_id: named(teamName, survival.team),
    };
  }
  return snapshot;
}

/** The golden tournament recalculated under `rules`, as golden-points.json. */
export function goldenSnapshot(
  rules: RuleSet,
  inputs: TournamentInputs = goldenInputs(),
  ids: GoldenIds = NAME_IDS,
): GoldenSnapshot {
  return snapshotOf(must(recalculateTournament(inputs, rules)), ids);
}

/** How many entries a snapshot holds, over its four tables. */
export function snapshotEntries(snapshot: GoldenSnapshot): number {
  return (
    Object.keys(snapshot.point_results).length +
    Object.keys(snapshot.point_standings).length +
    Object.keys(snapshot.point_survivals).length +
    Object.keys(snapshot.game_odds).length
  );
}
