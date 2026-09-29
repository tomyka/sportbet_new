import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Points } from '../points/points';
import { MatchPrediction } from '../prediction/match-prediction';
import type { Game } from '../round/game';
import type { Round } from '../round/round';
import { Season } from '../round/season';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import type { GameId } from '../shared/ids';
import { refuse } from '../shared/result';
import { StandingsPrediction } from '../standings/standings-prediction';
import { TeamOutcomes } from '../standings/team-outcomes';
import { SurvivalRun } from '../survival/survival-run';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  roundNo,
  score,
  team,
  teamOutcome,
  teamPick,
  unwrap,
  type GameSpec,
} from '../testing';
import {
  recalculateTournament,
  type StoredSurvivalRow,
  type TournamentInputs,
  type TournamentPoints,
} from './recalculation';

const seasonOf = (games: readonly Game[], rounds?: readonly Round[]) =>
  unwrap(
    Season.create({
      rounds:
        rounds ??
        [...new Set(games.map((game) => game.round))].map((number) =>
          makeRound({ number }),
        ),
      games,
      endsAt: at('2027-05-31T00:00:00Z'),
    }),
  );

const NO_OUTCOMES = unwrap(TeamOutcomes.enter([], false));

/** Inputs with nothing in them but the season; override what a test needs. */
const inputs = (
  games: readonly Game[],
  changes: Partial<TournamentInputs> = {},
): TournamentInputs => ({
  season: seasonOf(games),
  players: [],
  predictions: [],
  odds: 'from-votes',
  survival: { from: 'picks', runs: new Map() },
  standings: [],
  outcomes: NO_OUTCOMES,
  ...changes,
});

const recalculated = (
  of: TournamentInputs,
  rules: RuleSet = sportbetRules,
): TournamentPoints => unwrap(recalculateTournament(of, rules));

const predict = (name: string, game: number, home: number, away: number) =>
  unwrap(
    MatchPrediction.enter(
      { player: player(name), game: gameNo(game), home, away },
      sportbetRules,
    ),
  );
const fillIn = (name: string, game: number, home: number, away: number) =>
  MatchPrediction.fillIn(
    player(name),
    gameNo(game),
    score(home, away),
    'fill-in',
    at('2026-10-01T20:00:00Z'),
  );

// Golden `EL h1`: Zalgiris 88 - Olympiacos 79, odds 0.59 / 1.59 / 2.59.
const zalOly = (
  spec: Partial<Omit<GameSpec, 'result'>> & {
    readonly result?: GameSpec['result'] | null;
  } = {},
) => {
  const { result = [88, 79], ...rest } = spec;
  return makeGame({
    id: 1,
    round: 1,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2026-10-02T18:00:00Z',
    ...rest,
    ...(result === null ? {} : { result }),
  });
};
const oddsOf = (home: number, away: number, draw: number) =>
  CrowdOdds.stored(
    unwrap(Odds.ofHundredths(home)),
    unwrap(Odds.ofHundredths(away)),
    unwrap(Odds.ofHundredths(draw)),
  );
const GOLDEN_ODDS = oddsOf(59, 159, 259);
const storedOdds = (games: readonly Game[], odds = GOLDEN_ODDS) =>
  new Map<GameId, CrowdOdds>(games.map((game) => [game.id, odds]));

const fullOf = (points: TournamentPoints, name: string, game: number) =>
  points.matches
    .find((row) => row.player === player(name) && row.game === gameNo(game))
    ?.points.full.toString();

describe('LR-5: match points', () => {
  const games = [
    zalOly(),
    zalOly({ id: 2, tipOff: '2026-10-03T18:00:00Z', result: null }),
  ];
  const points = recalculated(
    inputs(games, {
      predictions: [
        predict('ada', 1, 85, 80),
        predict('ben', 1, 79, 88),
        predict('cai', 1, 90, 80),
        predict('ada', 2, 85, 80),
      ],
    }),
  );

  it("recalculation: each answered prediction of a scored game gets a row, keyed by player and game, at the game's crowd odds", () => {
    expect(
      points.matches.map((row) => [row.player, row.game, row.points.odds]),
    ).toEqual([
      [player('ada'), gameNo(1), GOLDEN_ODDS.home],
      [player('ben'), gameNo(1), GOLDEN_ODDS.away],
      [player('cai'), gameNo(1), GOLDEN_ODDS.home],
    ]);
    expect(fullOf(points, 'ada', 1)).toBe('125.50');
    // 3 votes, 2 home: the golden odds, computed from the votes.
    expect(points.odds.map((row) => row.game)).toEqual([gameNo(1)]);
    expect(points.odds[0]?.odds.home.equals(GOLDEN_ODDS.home)).toBe(true);
    expect(points.odds[0]?.odds.away.equals(GOLDEN_ODDS.away)).toBe(true);
    expect(points.odds[0]?.odds.source).toBe('votes');
  });

  it('result: a cleared result leaves no points', () => {
    expect(points.matches.some((row) => row.game === gameNo(2))).toBe(false);
    expect(points.odds.map((row) => row.game)).toEqual([gameNo(1)]);
  });

  it("result: a correction replaces the game's points", () => {
    // Monaco - Virtus: the admin types 80-78, then corrects it to 78-80.
    const monVir = (result: readonly [number, number]) => [
      zalOly({ home: 'MON', away: 'VIR', result }),
    ];
    const odds = storedOdds(monVir([80, 78]), oddsOf(32, 232, 432));
    const scored = (result: readonly [number, number]) =>
      fullOf(
        recalculated(
          inputs(monVir(result), {
            predictions: [predict('ada', 1, 80, 78)],
            odds,
          }),
        ),
        'ada',
        1,
      );
    expect(scored([80, 78])).toBe('136.00');
    expect(scored([78, 80])).toBe('46.00');
  });

  it('recalculation: refuses a prediction for a game the season does not have', () => {
    expect(
      recalculateTournament(
        inputs(games, { predictions: [predict('ada', 9, 85, 80)] }),
        sportbetRules,
      ),
    ).toEqual(refuse('prediction-for-unknown-game'));
  });

  it('recalculation: refuses two predictions of one player for one game', () => {
    expect(
      recalculateTournament(
        inputs(games, {
          predictions: [predict('ada', 1, 85, 80), predict('ada', 1, 90, 80)],
        }),
        sportbetRules,
      ),
    ).toEqual(refuse('two-predictions-for-one-game'));
  });
});

describe('CO-5 and CO-7: where the odds come from', () => {
  const ada = predict('ada', 1, 85, 80);
  const votes = [ada, predict('ben', 1, 79, 88), predict('cai', 1, 90, 80)];

  it('odds: the full recalculation reuses the odds the game was scored with', () => {
    // A month later the votes would say something else (a fill-in has since
    // been written); the recalculation reads the stored odds instead.
    const later = [...votes, fillIn('dan', 1, 70, 90)];
    const fromVotes = recalculated(inputs([zalOly()], { predictions: later }));
    expect(fromVotes.odds[0]?.odds.home.equals(GOLDEN_ODDS.home)).toBe(false);
    const fromStored = recalculated(
      inputs([zalOly()], {
        predictions: later,
        odds: storedOdds([zalOly()]),
      }),
    );
    expect(fromStored.odds[0]?.odds).toBe(GOLDEN_ODDS);
    expect(fullOf(fromStored, 'ada', 1)).toBe('125.50');
  });

  it('odds (sportbet): a game with no odds row scores at 1.0', () => {
    const points = recalculated(
      inputs([zalOly()], { predictions: [ada], odds: new Map() }),
    );
    // No game_odds row is stored for it, so none is returned; the odds it
    // was scored at are on its points rows.
    expect(points.odds).toEqual([]);
    const [row] = points.matches;
    expect(row?.points.odds.toString()).toBe('1.00');
    expect(row?.points.winner.toString()).toBe('100.00');
    expect(row?.points.full.toString()).toBe('146.00');
  });

  it('odds: stored odds for a game without a result are ignored', () => {
    const unscored = zalOly({ id: 2, tipOff: dayOf(2), result: null });
    const points = recalculated(
      inputs([zalOly(), unscored], {
        predictions: [ada, predict('ada', 2, 85, 80)],
        odds: storedOdds([zalOly(), unscored]),
      }),
    );
    expect(points.odds.map((row) => row.game)).toEqual([gameNo(1)]);
    expect(points.matches.map((row) => row.game)).toEqual([gameNo(1)]);
  });

  it('odds (ruled): odds always come from the votes, so a scored game without stored odds is refused', () => {
    expect(
      recalculateTournament(
        inputs([zalOly()], { predictions: [ada], odds: new Map() }),
        ruledRules,
      ),
    ).toEqual(refuse('odds-missing'));
  });

  it('recalculation: refuses stored odds for a game the season does not have', () => {
    expect(
      recalculateTournament(
        inputs([zalOly()], {
          odds: storedOdds([zalOly(), zalOly({ id: 9 })]),
        }),
        sportbetRules,
      ),
    ).toEqual(refuse('odds-for-unknown-game'));
  });
});

// ada's calls on a run of Zalgiris home wins (88-79 each), at the golden
// odds. By default game n tips off n days after 2026-10-01.
const dayOf = (id: number) =>
  new Date(Date.UTC(2026, 9, 1 + id, 18)).toISOString().replace('.000', '');
const RIGHT = [85, 80] as const;
const WRONG = [79, 88] as const;

interface SerijaCall {
  readonly id: number;
  readonly call: 'right' | 'wrong' | 'fill-in' | 'none';
  readonly score?: readonly [number, number];
  readonly round?: number;
  readonly tipOff?: string;
}

/** ada's serija bonus per game, and her serija total. */
function serijaOf(
  calls: readonly SerijaCall[],
  rates: Record<number, number> = {},
) {
  const games = calls.map((each) =>
    zalOly({
      id: each.id,
      round: each.round ?? 1,
      tipOff: each.tipOff ?? dayOf(each.id),
    }),
  );
  const rounds = [...new Set(games.map((game) => game.round))].map((number) =>
    makeRound({ number, rate: rates[number] ?? 1 }),
  );
  const predictions = calls.flatMap((each) => {
    const [home, away] = each.score ?? (each.call === 'wrong' ? WRONG : RIGHT);
    switch (each.call) {
      case 'none':
        return [];
      case 'fill-in':
        return [fillIn('ada', each.id, 82, 76)];
      case 'right':
      case 'wrong':
        return [predict('ada', each.id, home, away)];
    }
  });
  const points = recalculated({
    ...inputs(games, { predictions, odds: storedOdds(games) }),
    season: seasonOf(games, rounds),
  });
  return {
    bonuses: Object.fromEntries(
      points.matches.map((row) => [row.game, row.serija.toString()]),
    ),
    total: points.totals.find((each) => each.player === player('ada'))?.serija,
    points,
  };
}

describe('SE-1', () => {
  it('serija: a real right-winner call extends the run', () => {
    expect(
      serijaOf([
        { id: 1, call: 'right' },
        { id: 2, call: 'right' },
      ]).bonuses,
    ).toEqual({ 1: '0.00', 2: '10.00' });
  });

  it('serija: a fill-in ends the run', () => {
    // The fill-in named the winner and earned 50, but a fill-in never counts.
    const { bonuses, points } = serijaOf([
      { id: 1, call: 'right' },
      { id: 2, call: 'fill-in' },
      { id: 3, call: 'right' },
    ]);
    expect(
      points.matches
        .find((row) => row.game === gameNo(2))
        ?.points.winner.toString(),
    ).toBe('50.00');
    expect(bonuses).toEqual({ 1: '0.00', 2: '0.00', 3: '0.00' });
  });

  it('serija: a negative margin does not end the run', () => {
    // 120-50 on 88-79: the right winner, margin 50 - |70 - 9| = -11.
    const { bonuses, points } = serijaOf([
      { id: 1, call: 'right' },
      { id: 2, call: 'right', score: [120, 50] },
    ]);
    expect(
      points.matches
        .find((row) => row.game === gameNo(2))
        ?.points.margin.toString(),
    ).toBe('-11.00');
    expect(bonuses).toEqual({ 1: '0.00', 2: '10.00' });
  });
});

describe('SE-2', () => {
  it('serija: games are walked in tip-off order', () => {
    // A round-8 game postponed to 12-10 is walked at 12-10, between round
    // 15's games, whatever order the games arrive in.
    expect(
      serijaOf([
        { id: 80, call: 'wrong', round: 8, tipOff: '2026-12-10T18:00:00Z' },
        { id: 150, call: 'right', round: 15, tipOff: '2026-12-09T18:00:00Z' },
        { id: 151, call: 'right', round: 15, tipOff: '2026-12-11T18:00:00Z' },
        { id: 79, call: 'right', round: 8, tipOff: '2026-11-13T18:00:00Z' },
      ]).bonuses,
    ).toEqual({ 79: '0.00', 150: '10.00', 80: '0.00', 151: '0.00' });
  });

  it('serija: games at the same tip-off are walked by id', () => {
    const tipOff = '2026-12-10T18:00:00Z';
    expect(
      serijaOf([
        { id: 2, call: 'right', tipOff },
        { id: 1, call: 'right', tipOff },
      ]).bonuses,
    ).toEqual({ 1: '0.00', 2: '10.00' });
  });

  it('serija: a game with no points row ends the run', () => {
    // No row: the player was switched off and not filled in.
    expect(
      serijaOf([
        { id: 1, call: 'right' },
        { id: 2, call: 'none' },
        { id: 3, call: 'right' },
      ]).bonuses,
    ).toEqual({ 1: '0.00', 3: '0.00' });
  });

  it('serija: a game without a result is not walked', () => {
    const games = [
      zalOly(),
      zalOly({ id: 2, tipOff: dayOf(2), result: null }),
      zalOly({ id: 3, tipOff: dayOf(3) }),
    ];
    const points = recalculated(
      inputs(games, {
        predictions: [1, 2, 3].map((id) => predict('ada', id, ...RIGHT)),
        odds: storedOdds(games),
      }),
    );
    expect(points.matches.map((row) => row.serija.toString())).toEqual([
      '0.00',
      '10.00',
    ]);
  });
});

describe('SE-3', () => {
  it('serija: the first call of a run adds nothing', () => {
    expect(serijaOf([{ id: 1, call: 'right' }], { 1: 3 }).bonuses).toEqual({
      1: '0.00',
    });
  });

  it('serija: each later call adds 10 x its rate', () => {
    // Four in a row, the fourth a rate-2 play-off: 0, 10, 20, 60 = 90.
    const { bonuses, total } = serijaOf(
      [
        { id: 1, call: 'right' },
        { id: 2, call: 'right' },
        { id: 3, call: 'right' },
        { id: 4, call: 'right', round: 2 },
      ],
      { 2: 2 },
    );
    expect(bonuses).toEqual({
      1: '0.00',
      2: '10.00',
      3: '20.00',
      4: '60.00',
    });
    expect(total?.toString()).toBe('90.00');
  });
});

// Round 1: Real Madrid - Fenerbahce 70-95 (an away win). Round 2: Monaco -
// Virtus, whose result is typed as 80-78 and corrected to 78-80.
const survivalGames = (round2: readonly [number, number] | undefined) => [
  makeGame({
    id: 1,
    round: 1,
    home: 'REA',
    away: 'FEN',
    tipOff: '2026-10-01T18:00:00Z',
    result: [70, 95],
  }),
  makeGame({
    id: 2,
    round: 2,
    home: 'MON',
    away: 'VIR',
    tipOff: '2026-10-08T18:00:00Z',
    ...(round2 === undefined ? {} : { result: round2 }),
  }),
];
const runOf = (...picks: readonly (readonly [number, string])[]) =>
  unwrap(
    SurvivalRun.stored(
      picks.map(([round, picked]) => ({
        round: roundNo(round),
        team: team(picked),
      })),
    ),
  );
const storedRow = (
  id: number,
  name: string,
  round: number,
  picked: string,
  points: number,
): StoredSurvivalRow => ({
  id,
  player: player(name),
  round: roundNo(round),
  team: team(picked),
  storedPoints: unwrap(Points.whole(points)),
});
const survivalOf = (points: TournamentPoints) =>
  points.survival.map((row) => [
    row.player,
    row.round,
    row.team,
    row.points?.toString() ?? null,
  ]);

describe('survival: from the pick history or the stored rows', () => {
  const asta = runOf([1, 'FEN'], [2, 'VIR']);

  it.each([
    ['sportbet', sportbetRules],
    ['ruled', ruledRules],
  ] as const)(
    'survival: a pick history is scored per player, keyed by round and team (%s)',
    (_, rules) => {
      const points = recalculated(
        inputs(survivalGames([78, 80]), {
          survival: { from: 'picks', runs: new Map([[player('asta'), asta]]) },
        }),
        rules,
      );
      expect(survivalOf(points)).toEqual([
        [player('asta'), roundNo(1), team('FEN'), '12.00'],
        [player('asta'), roundNo(2), team('VIR'), '24.00'],
      ]);
    },
  );

  it('survival (ruled): a pick whose game has no result yet waits, with no points', () => {
    const points = recalculated(
      inputs(survivalGames(undefined), {
        survival: { from: 'picks', runs: new Map([[player('asta'), asta]]) },
      }),
      ruledRules,
    );
    expect(survivalOf(points)[1]).toEqual([
      player('asta'),
      roundNo(2),
      team('VIR'),
      null,
    ]);
  });

  it('survival (sportbet): stored rows are refolded, each paid by its game in the season, keeping their ids', () => {
    // SU-9: Asta stored 0 in round 2 on the mistaken 80-78; the refold never
    // reads results, so after the correction the 0 stays.
    const points = recalculated(
      inputs(survivalGames([78, 80]), {
        survival: {
          from: 'stored-rows',
          rows: [
            storedRow(7, 'asta', 1, 'FEN', 12),
            storedRow(8, 'asta', 2, 'VIR', 0),
          ],
        },
      }),
    );
    expect(survivalOf(points)).toEqual([
      [player('asta'), roundNo(1), team('FEN'), '12.00'],
      [player('asta'), roundNo(2), team('VIR'), '0.00'],
    ]);
    expect(points.survival.map((row) => row.storedId)).toEqual([7, 8]);
  });

  it('survival (sportbet): a stored row whose team has no game in its round pays the home rate', () => {
    const points = recalculated(
      inputs(survivalGames([78, 80]), {
        survival: {
          from: 'stored-rows',
          rows: [storedRow(1, 'asta', 2, 'FEN', 12)],
        },
      }),
    );
    expect(points.survival[0]?.points?.toString()).toBe('10.00');
  });

  it('survival (ruled): scored from the pick history, so stored rows are refused (R-5)', () => {
    expect(
      recalculateTournament(
        inputs(survivalGames([78, 80]), {
          survival: {
            from: 'stored-rows',
            rows: [storedRow(1, 'asta', 1, 'FEN', 12)],
          },
        }),
        ruledRules,
      ),
    ).toEqual(refuse('survival-scored-from-picks'));
  });

  it.each([
    [
      'a stored row in a round the season does not have',
      [storedRow(1, 'asta', 3, 'FEN', 12)],
      'survival-row-in-unknown-round',
    ],
    [
      'one stored row id twice',
      [storedRow(1, 'asta', 1, 'FEN', 12), storedRow(1, 'ben', 1, 'FEN', 12)],
      'survival-row-id-twice',
    ],
  ] as const)('survival (sportbet): refuses %s', (_, rows, refusal) => {
    expect(
      recalculateTournament(
        inputs(survivalGames([78, 80]), {
          survival: { from: 'stored-rows', rows },
        }),
        sportbetRules,
      ),
    ).toEqual(refuse(refusal));
  });

  it("survival: the player's points are the sum of the stored totals (SU-2)", () => {
    const points = recalculated(
      inputs(survivalGames([78, 80]), {
        survival: { from: 'picks', runs: new Map([[player('asta'), asta]]) },
      }),
    );
    expect(points.totals[0]?.survival.toString()).toBe('36.00');
  });
});

describe('standings and totals', () => {
  const outcomes = unwrap(
    TeamOutcomes.enter(
      [
        teamOutcome('ZAL', { place: 1, playOffs: true }),
        teamOutcome('OLY', { place: 2 }),
      ],
      true,
    ),
  );
  const standings = [
    unwrap(
      StandingsPrediction.enter(player('ada'), [
        teamPick('ZAL', { place: 1, playOffs: true }),
        teamPick('OLY', { place: 3 }),
      ]),
    ),
    unwrap(
      StandingsPrediction.enter(player('ben'), [
        teamPick('ZAL', { place: 2, playOffs: true }),
      ]),
    ),
  ];

  it("standings: every standings prediction's team rows are scored, keyed by player and team", () => {
    const points = recalculated(inputs([zalOly()], { standings, outcomes }));
    expect(
      points.standings.map((row) => [
        row.player,
        row.team,
        row.place.points?.toString(),
        row.playOffs.points?.toString(),
        row.finalFour.points,
      ]),
    ).toEqual([
      [player('ada'), team('ZAL'), '380.0000', '60.0000', null],
      [player('ada'), team('OLY'), '180.0000', '0.0000', null],
      [player('ben'), team('ZAL'), '180.0000', '60.0000', null],
    ]);
  });

  it('recalculation: refuses two standings predictions for one player', () => {
    expect(
      recalculateTournament(
        inputs([zalOly()], {
          standings: [
            ...standings,
            unwrap(StandingsPrediction.enter(player('ada'), [])),
          ],
          outcomes,
        }),
        sportbetRules,
      ),
    ).toEqual(refuse('two-standings-predictions'));
  });

  it('ranking: the total adds match, serija, standings and survival, for every player (RA-1)', () => {
    const points = recalculated(
      inputs([zalOly()], {
        players: [player('ada'), player('ben'), player('eve')],
        predictions: [predict('ada', 1, 85, 80)],
        standings,
        outcomes,
        survival: {
          from: 'picks',
          runs: new Map([[player('ben'), runOf([1, 'ZAL'])]]),
        },
      }),
    );
    expect(
      points.totals.map((each) => [
        each.player,
        each.match.toString(),
        each.serija.toString(),
        each.standings.toString(),
        each.survival.toString(),
      ]),
    ).toEqual([
      // ada's crowd of one gives the golden odds 0 here: 50 + 46.
      [player('ada'), '96.00', '0.00', '620.0000', '0.00'],
      [player('ben'), '0.00', '0.00', '240.0000', '10.00'],
      [player('eve'), '0.00', '0.00', '0.0000', '0.00'],
    ]);
  });

  it('recalculation: what it returns cannot be changed', () => {
    const points = recalculated(
      inputs([zalOly()], {
        players: [player('ada')],
        predictions: [predict('ada', 1, 85, 80)],
        standings,
        outcomes,
      }),
    );
    for (const list of [
      points.odds,
      points.matches,
      points.standings,
      points.survival,
      points.totals,
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(list.every((each) => Object.isFrozen(each))).toBe(true);
    }
    expect(Object.isFrozen(points)).toBe(true);
  });
});
