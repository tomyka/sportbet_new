// sportbet's golden scenario (tests/Support/GoldenScenario.php at 0da316f),
// its Euroleague part expressed as the stored rows a tournament holds, and
// the snapshot recalculateTournament derives from them in
// golden-points.json's shape. Test support: only golden.test.ts imports it,
// and index.ts does not export it. It uses no test helpers, because lint
// keeps runtime-looking files off `testing`.
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
  type StoredSurvivalRow,
  type TournamentInputs,
  type TournamentPoints,
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
} from '../shared/ids';
import { instantFrom } from '../shared/instant';
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

const PLAYERS = ['ada', 'ben', 'cai', 'dan'] as const;
type Name = (typeof PLAYERS)[number];

const GAMES = [
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
] as const;

// All real, none blank, so nobody is filled in. dan has no rows at all.
const PREDICTIONS: readonly (readonly [Name, number, number, number])[] = [
  ['ada', 1, 85, 80],
  ['ada', 2, 120, 50],
  ['ada', 3, 90, 85],
  ['ben', 1, 79, 88],
  ['ben', 2, 80, 90],
  ['ben', 3, 85, 90],
  ['cai', 1, 90, 80],
  ['cai', 2, 75, 90],
  ['cai', 3, 95, 80],
];

const row = (
  team: string,
  place: number,
  playOffs: boolean | null = null,
): StoredTeamPick => ({
  team: must(teamId(team)),
  place,
  playOffs,
  finalFour: null,
  finalPlace: null,
});

// Every column not named was never saved (null).
const STANDINGS: readonly (readonly [Name, readonly StoredTeamPick[]])[] = [
  [
    'ada',
    [row('ZAL', 1, true), row('OLY', 2, true), row('REA', 3), row('FEN', 4)],
  ],
  [
    'ben',
    [row('ZAL', 2, true), row('OLY', 1), row('REA', 4, true), row('FEN', 3)],
  ],
];

// Set directly, not through the lock.
const SURVIVAL: readonly (readonly [
  Name,
  readonly (readonly [number, string])[],
])[] = [
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
];

export interface GoldenSnapshot {
  readonly point_results: Record<string, Record<string, string>>;
  readonly point_standings: Record<string, Record<string, string | null>>;
  readonly point_survivals: Record<string, Record<string, string>>;
  readonly game_odds: Record<string, Record<string, string>>;
}

/**
 * Rows a golden snapshot holds, read back as the full recalculation reads
 * production's: the stored odds (CO-7) and the stored survival rows
 * (SU-10), in place of computing them from the votes and the picks.
 */
export interface GoldenStoredRows {
  readonly game_odds?: GoldenSnapshot['game_odds'];
  readonly point_survivals?: GoldenSnapshot['point_survivals'];
}

const gameKey = (game: GameId) => `EL h${String(game)}`;

/** A non-negative "12.0000" or "0.5900" as hundredths, exactly. */
const hundredths = (fourPlaces: string | undefined): number => {
  const match = /^(\d+)\.(\d{2})00$/.exec(fourPlaces ?? '');
  if (match === null)
    throw new Error(`golden: bad column ${String(fourPlaces)}`);
  return Number(match[1]) * 100 + Number(match[2]);
};

function oddsFrom(
  rows: GoldenSnapshot['game_odds'],
): ReadonlyMap<GameId, CrowdOdds> {
  return new Map(
    Object.entries(rows).map(([key, odds]) => [
      must(gameId(Number(key.replace('EL h', '')))),
      CrowdOdds.stored(
        must(Odds.ofHundredths(hundredths(odds['home_odds']))),
        must(Odds.ofHundredths(hundredths(odds['away_odds']))),
        must(Odds.ofHundredths(hundredths(odds['draw_odds']))),
      ),
    ]),
  );
}

function survivalFrom(
  rows: GoldenSnapshot['point_survivals'],
): StoredSurvivalRow[] {
  return Object.entries(rows).map(([key, stored], index) => {
    const [name, round] = key.split(' / EL E');
    if (name === undefined || round === undefined) {
      throw new Error(`golden: bad survival key ${key}`);
    }
    return {
      id: index + 1,
      player: must(playerId(name)),
      round: must(roundNumber(Number(round))),
      team: must(teamId(stored['team_id'] ?? '')),
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
export function goldenInputs(stored: GoldenStoredRows = {}): TournamentInputs {
  const rounds = [1, 2].map((number) =>
    Round.stored({
      number: must(roundNumber(number)),
      stage: 'regular',
      rate: Rate.ONE,
      survival: true,
      // E2 is flagged knockout (MS-8).
      knockout: number === 2,
    }),
  );
  const games = GAMES.map((spec) =>
    must(
      Game.stored({
        id: must(gameId(spec.id)),
        round: must(roundNumber(spec.round)),
        home: must(teamId(spec.home)),
        away: must(teamId(spec.away)),
        tipOff: must(instantFrom(spec.tipOff)),
        result: must(Score.of(spec.result[0], spec.result[1])),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  );
  const season = must(
    Season.create({
      rounds,
      games,
      endsAt: must(instantFrom('2026-06-30T00:00:00Z')),
    }),
  );

  // Standings: the table and play-off ticks as entered; no Final Four, no
  // final.
  const outcome = (team: string, place: number, playOffs: boolean) => ({
    team: must(teamId(team)),
    place,
    playOffs,
    finalFour: false,
    finalPlace: null,
  });

  return {
    season,
    players: PLAYERS.map((name) => must(playerId(name))),
    predictions: PREDICTIONS.map(([name, game, home, away]) =>
      must(
        MatchPrediction.stored({
          player: must(playerId(name)),
          game: must(gameId(game)),
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
        : oddsFrom(stored.game_odds),
    survival:
      stored.point_survivals === undefined
        ? {
            from: 'picks',
            runs: new Map(
              SURVIVAL.map(([name, picks]): [PlayerId, SurvivalRun] => [
                must(playerId(name)),
                must(
                  SurvivalRun.stored(
                    picks.map(([round, team]) => ({
                      round: must(roundNumber(round)),
                      team: must(teamId(team)),
                    })),
                  ),
                ),
              ]),
            ),
          }
        : { from: 'stored-rows', rows: survivalFrom(stored.point_survivals) },
    standings: STANDINGS.map(([name, picks]) =>
      must(StandingsPrediction.stored(must(playerId(name)), picks)),
    ),
    outcomes: must(
      TeamOutcomes.stored(
        [
          outcome('ZAL', 1, true),
          outcome('OLY', 2, true),
          outcome('REA', 3, false),
          outcome('FEN', 4, false),
        ],
        true,
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

/** A recalculation's rows in golden-points.json's shape. */
function snapshotOf(points: TournamentPoints): GoldenSnapshot {
  const snapshot: GoldenSnapshot = {
    point_results: {},
    point_standings: {},
    point_survivals: {},
    game_odds: {},
  };
  for (const { game, odds } of points.odds) {
    snapshot.game_odds[gameKey(game)] = {
      home_odds: four(odds.home),
      away_odds: four(odds.away),
      draw_odds: four(odds.draw),
    };
  }
  for (const { player, game, points: match, serija } of points.matches) {
    snapshot.point_results[`${player} / ${gameKey(game)}`] = {
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
    snapshot.point_standings[`${team.player} / ${team.team}`] = {
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
      `${survival.player} / EL E${String(survival.round)}`
    ] = {
      survival_points:
        survival.points === null ? 'pending' : four(survival.points),
      team_id: survival.team,
    };
  }
  return snapshot;
}

/** The golden tournament recalculated under `rules`, as golden-points.json. */
export function goldenSnapshot(
  rules: RuleSet,
  inputs: TournamentInputs = goldenInputs(),
): GoldenSnapshot {
  return snapshotOf(must(recalculateTournament(inputs, rules)));
}
