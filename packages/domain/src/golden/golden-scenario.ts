// sportbet's golden scenario (tests/Support/GoldenScenario.php at 0da316f),
// its Euroleague part expressed as domain inputs, and the snapshot the
// domain produces from it in golden-points.json's shape. Test support: only
// golden.test.ts imports it, and index.ts does not export it. It uses no
// test helpers, because lint keeps runtime-looking files off `testing`.
//
// Tournaments are kept apart, so the football part of the scenario only
// proves that independence and is left out (catalogue, golden master
// mapping).

import { CrowdOdds } from '../odds/crowd-odds';
import type { StandingsOdds } from '../points/odds';
import type { StandingsPoints } from '../points/standings-points';
import { MatchPrediction } from '../prediction/match-prediction';
import type { MatchPoints } from '../prediction/match-scoring';
import { Game } from '../round/game';
import { Round } from '../round/round';
import type { RuleSet } from '../rules/rule-set';
import { walkSerija } from '../serija/serija';
import type { Points } from '../points/points';
import {
  gameId,
  playerId,
  roundNumber,
  teamId,
  tournamentId,
  type RoundNumber,
  type TeamId,
} from '../shared/ids';
import { instantFrom } from '../shared/instant';
import type { Result } from '../shared/result';
import { Rate, Score } from '../score/score';
import {
  StandingsPrediction,
  type TeamPick,
} from '../standings/standings-prediction';
import {
  scoreStandings,
  type StandingsLine,
} from '../standings/standings-scoring';
import { TeamOutcomes } from '../standings/team-outcomes';
import { refoldStoredSurvival } from '../survival/stored-survival';
import { SurvivalRun } from '../survival/survival-run';

function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`golden scenario refused: ${result.refusal}`);
  return result.value;
}

const TOURNAMENT = must(tournamentId('EL'));
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
): TeamPick => ({
  team: must(teamId(team)),
  place,
  playOffs,
  finalFour: null,
  finalPlace: null,
});

// Every column not named was never saved (null).
const STANDINGS: readonly (readonly [Name, readonly TeamPick[]])[] = [
  [
    'ada',
    [row('ZAL', 1, true), row('OLY', 2, true), row('REA', 3), row('FEN', 4)],
  ],
  [
    'ben',
    [row('ZAL', 2, true), row('OLY', 1), row('REA', 4, true), row('FEN', 3)],
  ],
];

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

const goldenGames = (rules: RuleSet): Game[] =>
  GAMES.map((spec) =>
    must(
      must(
        Game.schedule({
          id: must(gameId(spec.id)),
          round: must(roundNumber(spec.round)),
          home: must(teamId(spec.home)),
          away: must(teamId(spec.away)),
          tipOff: must(instantFrom(spec.tipOff)),
        }),
      ).withResult(must(Score.of(spec.result[0], spec.result[1])), rules),
    ),
  );

const survivalRun = (picks: readonly (readonly [number, string])[]) =>
  must(
    SurvivalRun.of(
      picks.map(([round, team]) => ({
        round: must(roundNumber(round)),
        team: must(teamId(team)),
      })),
    ),
  );

/**
 * sportbet's two survival passes in turn: the rows each result entry
 * stored, then the full recalculation's refold of those rows (SU-10).
 */
function refoldAtEntry(
  name: Name,
  run: SurvivalRun,
  games: readonly Game[],
  rules: RuleSet,
): { round: RoundNumber; team: TeamId; points: Points | null }[] {
  const stored = run.atResultEntry(games).flatMap((row, index) =>
    row.points === null
      ? []
      : [
          {
            id: index + 1,
            player: must(playerId(name)),
            tournament: TOURNAMENT,
            round: row.round,
            team: row.team,
            storedPoints: row.points,
            awayTeam:
              games.find(
                (game) => game.round === row.round && game.plays(row.team),
              )?.away ?? null,
          },
        ],
  );
  const refolded = must(refoldStoredSurvival(stored, rules));
  return stored.map((row) => ({
    round: row.round,
    team: row.team,
    points: refolded.find((each) => each.id === row.id)?.points ?? null,
  }));
}

export interface GoldenSnapshot {
  readonly point_results: Record<string, Record<string, string>>;
  readonly point_standings: Record<string, Record<string, string | null>>;
  readonly point_survivals: Record<string, Record<string, string>>;
  readonly game_odds: Record<string, Record<string, string>>;
}

const four = (twoPlaces: { toString(): string }) => `${twoPlaces.toString()}00`;
const line = (value: StandingsPoints | StandingsOdds | null) =>
  value === null ? null : value.toString();
const columns = (name: string, standings: StandingsLine) => ({
  [`${name}_points`]: line(standings.points),
  [`${name}_odds`]: line(standings.odds),
});

/** Scores the golden scenario under `rules`, in golden-points.json's shape. */
export function goldenSnapshot(rules: RuleSet): GoldenSnapshot {
  const rounds = [1, 2].map((number) =>
    must(
      Round.create(
        {
          number: must(roundNumber(number)),
          stage: 'regular',
          rate: Rate.ONE,
          survival: true,
          // E2 is flagged knockout (MS-8).
          knockout: number === 2,
        },
        rules,
      ),
    ),
  );
  const games = goldenGames(rules);
  const predictions = PREDICTIONS.map(([name, game, home, away]) =>
    must(
      MatchPrediction.enter(
        { player: must(playerId(name)), game: must(gameId(game)), home, away },
        rules,
      ),
    ),
  );

  const snapshot: GoldenSnapshot = {
    point_results: {},
    point_standings: {},
    point_survivals: {},
    game_odds: {},
  };

  const roundOf = (game: Game): Round => {
    const round = rounds.find((each) => each.number === game.round);
    if (round === undefined) throw new Error('golden scenario: no round');
    return round;
  };

  // Crowd odds, then each game's points (Recalculation::afterResultEntered).
  const pointsOf = new Map<string, MatchPoints>();
  for (const game of games) {
    const votes = predictions.filter((each) => each.game === game.id);
    const odds = CrowdOdds.forGame(votes, rules);
    snapshot.game_odds[`EL h${String(game.id)}`] = {
      home_odds: four(odds.home),
      away_odds: four(odds.away),
      draw_odds: four(odds.draw),
    };
    const round = roundOf(game);
    for (const prediction of votes) {
      const points = prediction.score(game, round, odds);
      if (points !== null) {
        pointsOf.set(`${prediction.player} / EL h${String(game.id)}`, points);
      }
    }
  }

  // The serija, per player, over every scored game of the tournament.
  for (const name of PLAYERS) {
    const bonuses = walkSerija(
      games.map((game) => ({
        tournament: TOURNAMENT,
        game: game.id,
        tipOff: game.tipOff,
        rate: roundOf(game).rate,
        points: pointsOf.get(`${name} / EL h${String(game.id)}`) ?? null,
      })),
    );
    for (const { game, bonus } of bonuses) {
      const key = `${name} / EL h${String(game)}`;
      const points = pointsOf.get(key);
      if (points === undefined) continue;
      snapshot.point_results[key] = {
        winner_points: four(points.winner),
        difference_points: four(points.margin),
        bingo_points: four(points.bingo),
        odds_points: four(points.oddsPoints),
        full_points: four(points.full),
        odds: four(points.odds),
        streak_bonus: four(bonus),
      };
    }
  }

  // Standings: the table and play-off ticks as entered; no Final Four, no
  // final. Euroleague plays no last 16 or last 32: always null.
  const outcome = (team: string, place: number, playOffs: boolean) => ({
    team: must(teamId(team)),
    place,
    playOffs,
    finalFour: false,
    finalPlace: null,
  });
  const outcomes = must(
    TeamOutcomes.of(
      [
        outcome('ZAL', 1, true),
        outcome('OLY', 2, true),
        outcome('REA', 3, false),
        outcome('FEN', 4, false),
      ],
      true,
    ),
  );
  const everyone = STANDINGS.map(([name, picks]) =>
    must(StandingsPrediction.of(must(playerId(name)), picks)),
  );
  for (const prediction of everyone) {
    for (const team of must(
      scoreStandings(prediction, everyone, outcomes, rules),
    )) {
      snapshot.point_standings[`${prediction.player} / ${team.team}`] = {
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
  }

  // Survival, set directly (not through the lock). sportbet stores each
  // round at its result entry and the full recalculation then refolds the
  // stored rows (SU-10); the ruled set folds the pick history (R-5).
  for (const [name, picks] of SURVIVAL) {
    const run = survivalRun(picks);
    const rows = rules.survivalScoredFromStoredRows
      ? refoldAtEntry(name, run, games, rules)
      : run.fold(games);
    for (const survival of rows) {
      snapshot.point_survivals[`${name} / EL E${String(survival.round)}`] = {
        survival_points:
          survival.points === null ? 'pending' : four(survival.points),
        team_id: survival.team,
      };
    }
  }

  return snapshot;
}

/** The survival rows sportbet wrote at result entry, for the SU-10 check. */
export function goldenSurvivalPasses(rules: RuleSet): {
  readonly atEntry: readonly (string | null)[];
  readonly folded: readonly (string | null)[];
} {
  const games = goldenGames(rules);
  const atEntry: (string | null)[] = [];
  const folded: (string | null)[] = [];
  for (const [, picks] of SURVIVAL) {
    const run = survivalRun(picks);
    atEntry.push(
      ...run
        .atResultEntry(games)
        .map((each) => each.points?.toString() ?? null),
    );
    folded.push(
      ...run.fold(games).map((each) => each.points?.toString() ?? null),
    );
  }
  return { atEntry, folded };
}
