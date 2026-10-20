import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/euroleague-e2026-games.json';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { stageRate } from '../round/round-admin';
import { Season } from '../round/season';
import { Score } from '../score/score';
import { at, gameNo, roundNo, team, unwrap } from '../testing';
import { secondsAfter, type Instant } from '../shared/instant';
import { parseEuroleagueFeed, type EuroleagueFixture } from './euroleague-feed';
import {
  IMPORTED_ROUND_SURVIVAL,
  canonicalPlan,
  importedRoundSurvival,
  isNoop,
  planEuroleagueImport,
  type ImportInput,
  type ImportPlan,
  type ImportRefusal,
  type ImportTeam,
} from './import-plan';

const NOW = at('2026-09-20T12:00:00Z');
const FIRST_TIP_OFF = at('2026-09-24T16:00:00Z');
const hourAfter = (instant: Instant): Instant => secondsAfter(instant, 3600);

const parsedFeed = parseEuroleagueFeed(structuredClone(fixture));
if (!parsedFeed.ok) throw new Error('the fixture is refused');
const FIXTURES = parsedFeed.value.fixtures;

function input(change: Partial<ImportInput> = {}): ImportInput {
  return {
    fixtures: FIXTURES,
    postSeasonLeftOut: 0,
    teams: [],
    season: unwrap(Season.create({ rounds: [], games: [], endsAt: null })),
    playerCount: 3,
    survivalPlayed: true,
    finished: false,
    now: NOW,
    ...change,
  };
}

function planned(change: Partial<ImportInput> = {}): ImportPlan {
  const result = planEuroleagueImport(input(change));
  if (!result.ok) throw new Error(`refused: ${result.refusal.kind}`);
  return result.value;
}

function refusalOf(change: Partial<ImportInput>): ImportRefusal {
  const result = planEuroleagueImport(input(change));
  if (result.ok) throw new Error('expected a refusal');
  return result.refusal;
}

interface Applied {
  readonly teams: ImportTeam[];
  readonly rounds: Round[];
  readonly games: Game[];
}

/** The state an apply of `plan` leaves: ids handed out in order. */
function applied(plan: ImportPlan, before: Applied | null = null): Applied {
  const teams = [...(before?.teams ?? [])];
  for (const name of plan.teamsToCreate) {
    teams.push({ id: team(String(teams.length + 1)), name });
  }
  const rounds = [
    ...(before?.rounds ?? []),
    ...plan.roundsToCreate.map((created) => created.round),
  ];
  const games = [...(before?.games ?? [])];
  for (const planned of plan.gamesToCreate) {
    const idOf = (name: string) => {
      const found = teams.find(
        (each) => each.name.toLowerCase() === name.toLowerCase(),
      );
      if (found === undefined) throw new Error(`no team ${name}`);
      return found.id;
    };
    games.push(
      unwrap(
        Game.schedule({
          id: gameNo(games.length + 1),
          round: planned.round,
          home: idOf(planned.home),
          away: idOf(planned.away),
          tipOff: planned.tipOff,
        }),
      ),
    );
  }
  return { teams, rounds, games };
}

function stateInput(state: Applied, change: Partial<ImportInput> = {}) {
  return input({
    teams: state.teams,
    season: unwrap(
      Season.create({ rounds: state.rounds, games: state.games, endsAt: null }),
    ),
    ...change,
  });
}

const afterFirstImport = () => applied(planned());

/** Index of the game of the feed's first fixture, Hapoel IBI Tel Aviv v FC Bayern Munich. */
function hapoelIndex(state: Applied): number {
  const home = state.teams.find((each) => each.name === 'Hapoel IBI Tel Aviv');
  const index = state.games.findIndex((game) => game.home === home?.id);
  if (index < 0) throw new Error('no Hapoel game');
  return index;
}

function withGame(
  state: Applied,
  index: number,
  change: (game: Game) => Game,
): Applied {
  return {
    ...state,
    games: state.games.map((game, at) => (at === index ? change(game) : game)),
  };
}

function fixturesWithFirstAt(tipOff: Instant): EuroleagueFixture[] {
  return FIXTURES.map((each, index) =>
    index === 0 ? { ...each, tipOff } : each,
  );
}

describe('planEuroleagueImport', () => {
  it('plans an empty tournament: 20 teams, 2 rounds, 20 games, every crest found (R-96)', () => {
    const plan = planned();
    expect(plan.teamsToCreate).toHaveLength(20);
    expect(plan.roundsToCreate.map((each) => each.name)).toEqual([
      '1 turas',
      '2 turas',
    ]);
    expect(plan.gamesToCreate).toHaveLength(20);
    expect(plan.moves).toEqual([]);
    expect(plan.skippedMoves).toEqual([]);
    expect(plan.dropped).toEqual([]);
    expect(plan.teamsWithoutCrest).toEqual([]);
    expect(plan.playersAffected).toBe(3);
    expect(isNoop(plan)).toBe(false);
  });

  it('creates rounds as sportbet does (R-10): regular, rate 1, not knockout', () => {
    for (const { round } of planned().roundsToCreate) {
      expect(round).toMatchObject({
        stage: 'regular',
        knockout: false,
        survival: true,
      });
      expect(round.rate.value).toBe(1);
    }
  });

  it('the applied state planned again is a no-op', () => {
    const plan = planEuroleagueImport(stateInput(afterFirstImport()));
    if (!plan.ok) throw new Error('refused');
    expect(isNoop(plan.value)).toBe(true);
    expect(plan.value.unchanged).toBe(20);
  });

  it('moves a game an hour later while it is open, as Game.reschedule leaves it', () => {
    const state = afterFirstImport();
    const plan = planned({
      ...stateInput(state),
      fixtures: fixturesWithFirstAt(hourAfter(FIRST_TIP_OFF)),
    });
    expect(plan.moves).toEqual([
      {
        game: state.games[hapoelIndex(state)]?.id,
        label: 'Hapoel IBI Tel Aviv - FC Bayern Munich',
        from: FIRST_TIP_OFF,
        to: hourAfter(FIRST_TIP_OFF),
        lockedSince: null,
        postponed: false,
      },
    ]);
    expect(plan.skippedMoves).toEqual([]);
    expect(plan.unchanged).toBe(19);
    expect(isNoop(plan)).toBe(false);
  });

  it.each([
    [
      'scored',
      (game: Game) => unwrap(game.withResult(unwrap(Score.of(90, 80)))),
      NOW,
    ],
    ['postponed', (game: Game) => unwrap(game.postpone(NOW)), NOW],
    ['locked', (game: Game) => game, hourAfter(FIRST_TIP_OFF)],
    [
      'locked',
      (game: Game) =>
        unwrap(
          Game.stored({
            id: game.id,
            round: game.round,
            home: game.home,
            away: game.away,
            tipOff: game.tipOff,
            result: null,
            recordedWinner: null,
            lockedSince: game.tipOff,
            postponed: false,
          }),
        ),
      NOW,
    ],
  ])(
    'skips a %s game the feed moves, moving nothing',
    (reason, change, now) => {
      const state = (() => {
        const before = afterFirstImport();
        return withGame(before, hapoelIndex(before), change);
      })();
      const plan = planned({
        ...stateInput(state, { now }),
        fixtures: fixturesWithFirstAt(hourAfter(FIRST_TIP_OFF)),
      });
      expect(plan.moves).toEqual([]);
      expect(plan.skippedMoves).toEqual([
        {
          game: state.games[hapoelIndex(state)]?.id,
          label: 'Hapoel IBI Tel Aviv - FC Bayern Munich',
          from: FIRST_TIP_OFF,
          to: hourAfter(FIRST_TIP_OFF),
          reason,
        },
      ]);
      expect(isNoop(plan)).toBe(true);
    },
  );
});

describe('planEuroleagueImport: games the feed lacks', () => {
  it('lists a regular-season game the feed lacks as dropped (R-94), by round then tip-off', () => {
    const state = afterFirstImport();
    const [first, second] = state.games;
    if (first === undefined || second === undefined) throw new Error('short');
    const without = FIXTURES.filter((_each, index) => index > 1);
    const plan = planned({ ...stateInput(state), fixtures: without });
    expect(plan.dropped.map((each) => each.game)).toEqual(
      [first, second]
        .sort((a, b) => a.round - b.round || a.tipOff - b.tipOff)
        .map((each) => each.id),
    );
    expect(plan.dropped[0]?.label).toContain(' - ');
    expect(isNoop(plan)).toBe(true);
  });

  it('does not drop a game of a play-offs round the feed lacks', () => {
    const state = afterFirstImport();
    const playoffs = Round.stored({
      number: roundNo(39),
      stage: 'play-offs',
      rate: stageRate('play-offs'),
      survival: false,
      knockout: false,
    });
    const extra = unwrap(
      Game.schedule({
        id: gameNo(99),
        round: roundNo(39),
        home: team('1'),
        away: team('2'),
        tipOff: at('2027-05-01T18:00:00Z'),
      }),
    );
    const plan = planned(
      stateInput({
        ...state,
        rounds: [...state.rounds, playoffs],
        games: [...state.games, extra],
      }),
    );
    expect(plan.dropped).toEqual([]);
  });

  it('refuses a finished tournament before anything else', () => {
    expect(refusalOf({ finished: true, teams: [], fixtures: [] })).toEqual({
      kind: 'tournament-finished',
    });
  });

  it('refuses two teams with one key, naming the second (410-430)', () => {
    const teams = [
      { id: team('1'), name: 'Zalgiris Kaunas' },
      { id: team('2'), name: 'zalgiris  kaunas' },
    ];
    expect(refusalOf({ teams })).toEqual({
      kind: 'duplicate-team-names',
      team: 'zalgiris  kaunas',
    });
  });

  it('refuses a club the tournament lacks when it has teams, naming it (173-191)', () => {
    const teams = [{ id: team('1'), name: 'Zalgiris' }];
    const refusal = refusalOf({ teams });
    expect(refusal.kind).toBe('unmatched-teams');
    expect('teams' in refusal && refusal.teams).toContain('Zalgiris Kaunas');
  });

  it('names the unmatched clubs sorted by key', () => {
    const refusal = refusalOf({ teams: [{ id: team('1'), name: 'Zalgiris' }] });
    if (refusal.kind !== 'unmatched-teams') throw new Error('wrong refusal');
    expect(refusal.teams).toHaveLength(20);
    const keys = refusal.teams.map((name) => name.toLowerCase());
    expect(keys).toEqual([...keys].sort());
  });

  it('matches a team across case and spacing: "Dubai  basketball"', () => {
    const state = afterFirstImport();
    const teams = state.teams.map((each) =>
      each.name === 'Dubai Basketball'
        ? { ...each, name: 'Dubai  basketball' }
        : each,
    );
    const plan = planned(stateInput({ ...state, teams }));
    expect(plan.teamsToCreate).toEqual([]);
    expect(isNoop(plan)).toBe(true);
  });

  it('lists a renamed club with no crest (R-96)', () => {
    const state = afterFirstImport();
    const fixtures = FIXTURES.map((each) =>
      each.home === 'Zalgiris Kaunas' ? { ...each, home: 'Zalgiris' } : each,
    ).map((each) =>
      each.away === 'Zalgiris Kaunas' ? { ...each, away: 'Zalgiris' } : each,
    );
    const teams = state.teams.map((each) =>
      each.name === 'Zalgiris Kaunas' ? { ...each, name: 'Zalgiris' } : each,
    );
    const plan = planned({ ...stateInput({ ...state, teams }), fixtures });
    expect(plan.teamsWithoutCrest).toEqual(['Zalgiris']);
  });

  it('refuses a feed round the tournament holds as another stage (R-94)', () => {
    const state = afterFirstImport();
    const rounds = state.rounds.map((each) =>
      each.number === 2
        ? Round.stored({
            number: each.number,
            stage: 'play-offs',
            rate: each.rate,
            survival: false,
            knockout: each.knockout,
          })
        : each,
    );
    expect(refusalOf(stateInput({ ...state, rounds }))).toEqual({
      kind: 'round-not-regular',
      round: 2,
    });
  });

  it('refuses a fixture the feed lists twice, by key', () => {
    const [first] = FIXTURES;
    if (first === undefined) throw new Error('empty');
    const twice = [
      ...FIXTURES,
      {
        ...first,
        home: ' hapoel  IBI tel aviv',
        tipOff: at('2026-10-01T10:00:00Z'),
      },
    ];
    expect(refusalOf({ fixtures: twice })).toEqual({
      kind: 'duplicate-fixture',
      round: 1,
      home: ' hapoel  IBI tel aviv',
      away: 'FC Bayern Munich',
    });
  });

  it('carries the post-season count and player count into the plan', () => {
    const plan = planned({ postSeasonLeftOut: 4, playerCount: 7 });
    expect(plan.postSeasonLeftOut).toBe(4);
    expect(plan.playersAffected).toBe(7);
  });

  it('plans a game between existing teams into a new round, creating no team', () => {
    const state = afterFirstImport();
    const [first] = FIXTURES;
    if (first === undefined) throw new Error('empty');
    const plan = planned({
      ...stateInput(state),
      fixtures: [...FIXTURES, { ...first, round: roundNo(3) }],
    });
    expect(plan.teamsToCreate).toEqual([]);
    expect(plan.roundsToCreate.map((each) => each.round.number)).toEqual([3]);
    expect(plan.gamesToCreate).toHaveLength(1);
  });

  it('has the created rounds follow the tournament survival switch (R-129)', () => {
    expect(IMPORTED_ROUND_SURVIVAL).toBe('tournament');
    const survivals = (survivalPlayed: boolean) =>
      planned({ survivalPlayed }).roundsToCreate.map(
        (each) => each.round.survival,
      );
    expect(survivals(true)).toEqual([true, true]);
    expect(survivals(false)).toEqual([false, false]);
  });
});

describe('importedRoundSurvival', () => {
  it.each([
    ['tournament', true, true],
    ['tournament', false, false],
    ['off', true, false],
    ['off', false, false],
  ] as const)(
    '%s policy with the switch %s gives %s',
    (policy, switchOn, expected) => {
      expect(importedRoundSurvival(policy, switchOn)).toBe(expected);
    },
  );
});

describe('canonicalPlan', () => {
  it('is equal for shuffled fixtures', () => {
    const shuffled = [...FIXTURES].reverse();
    expect(canonicalPlan(planned({ fixtures: shuffled }))).toBe(
      canonicalPlan(planned()),
    );
  });

  it('differs after one move, one skip, one dropped game or one more player', () => {
    const state = afterFirstImport();
    const base = canonicalPlan(planned(stateInput(state)));
    const moved = planned({
      ...stateInput(state),
      fixtures: fixturesWithFirstAt(hourAfter(FIRST_TIP_OFF)),
    });
    expect(canonicalPlan(moved)).not.toBe(base);
    const skipped = planned({
      ...stateInput(
        withGame(state, hapoelIndex(state), (game) =>
          unwrap(game.withResult(unwrap(Score.of(1, 0)))),
        ),
      ),
      fixtures: fixturesWithFirstAt(hourAfter(FIRST_TIP_OFF)),
    });
    expect(canonicalPlan(skipped)).not.toBe(base);
    expect(canonicalPlan(skipped)).not.toBe(canonicalPlan(moved));
    expect(
      canonicalPlan(
        planned({ ...stateInput(state), fixtures: FIXTURES.slice(1) }),
      ),
    ).not.toBe(base);
    expect(
      canonicalPlan(planned(stateInput(state, { playerCount: 4 }))),
    ).not.toBe(base);
  });

  it('differs after the survival switch changes the created rounds', () => {
    expect(canonicalPlan(planned({ survivalPlayed: false }))).not.toBe(
      canonicalPlan(planned({ survivalPlayed: true })),
    );
  });

  it('is stable for the same plan and names instants as ISO text', () => {
    const text = canonicalPlan(planned());
    expect(text).toBe(canonicalPlan(planned()));
    expect(text).toContain('2026-09-24T16:00:00.000Z');
  });

  it('differs after a post-season count or a crestless team', () => {
    expect(canonicalPlan(planned({ postSeasonLeftOut: 1 }))).not.toBe(
      canonicalPlan(planned()),
    );
  });
});
