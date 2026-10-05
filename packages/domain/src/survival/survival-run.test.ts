import { describe, expect, it } from 'vitest';
import type { Game } from '../round/game';
import type { Round } from '../round/round';
import { Season } from '../round/season';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import { refuse } from '../shared/result';
import {
  at,
  makeGame,
  makeRound,
  roundNo,
  score,
  team,
  unwrap,
} from '../testing';
import {
  foldSurvival,
  survivalAtResultEntry,
  type SurvivalPick,
} from './survival-fold';
import { SurvivalRun } from './survival-run';

const END = at('2027-05-31T00:00:00Z');
const seasonOf = (rounds: readonly Round[], games: readonly Game[]) =>
  unwrap(Season.create({ rounds, games, endsAt: END }));
const context = (season: Season, now: string) => ({ season, now: at(now) });
const picked = (run: SurvivalRun) =>
  run.picks.map((pick) => `${String(pick.round)}:${pick.team}`);
const bothSets = [
  ['sportbet', sportbetRules],
  ['ruled', ruledRules],
] as const;

describe('SU-4', () => {
  // Round 1: Olympiacos play Tuesday, Barcelona Thursday.
  const olympiacos = makeGame({
    id: 1,
    round: 1,
    home: 'OLY',
    away: 'MON',
    tipOff: '2026-10-06T18:00:00Z',
  });
  const barcelona = makeGame({
    id: 2,
    round: 1,
    home: 'BAR',
    away: 'REA',
    tipOff: '2026-10-08T18:00:00Z',
  });
  const season = seasonOf([makeRound({ number: 1 })], [olympiacos, barcelona]);
  const monday = '2026-10-05T12:00:00Z';
  const halfTime = '2026-10-06T19:00:00Z';
  const onOlympiacos = (rules: RuleSet) =>
    unwrap(
      SurvivalRun.EMPTY.withPick(team('OLY'), context(season, monday), rules),
    );

  it('survival (ruled): a pick cannot change after its team tips off', () => {
    expect(
      onOlympiacos(ruledRules).withPick(
        team('BAR'),
        context(season, halfTime),
        ruledRules,
      ),
    ).toEqual(refuse('pick-locked'));
  });

  it("survival (sportbet): a pick can still change after its team tips off (0da316f's write path, open on #13)", () => {
    const switched = unwrap(
      onOlympiacos(sportbetRules).withPick(
        team('BAR'),
        context(season, halfTime),
        sportbetRules,
      ),
    );
    expect(picked(switched)).toEqual(['1:BAR']);
  });

  for (const [set, rules] of bothSets) {
    it(`survival (${set}): a team whose game has started cannot be picked (sportbet#256)`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(
          team('MON'),
          context(season, halfTime),
          rules,
        ),
      ).toEqual(refuse('team-already-started'));
    });

    it(`survival (${set}): a team stays open until its own game starts, after the round's first tip-off (R-41, sportbet#297)`, () => {
      // Olympiacos have tipped off; Barcelona have not.
      const first = unwrap(
        SurvivalRun.EMPTY.withPick(
          team('BAR'),
          context(season, halfTime),
          rules,
        ),
      );
      expect(picked(first)).toEqual(['1:BAR']);
    });

    it(`survival (${set}): a pick can change before its team tips off`, () => {
      const switched = unwrap(
        onOlympiacos(rules).withPick(
          team('BAR'),
          context(season, monday),
          rules,
        ),
      );
      expect(picked(switched)).toEqual(['1:BAR']);
    });

    it(`survival (${set}): a scored round's pick cannot change`, () => {
      // Olympiacos's result entered ahead of its tip-off.
      const scored = unwrap(
        season.withGame(unwrap(olympiacos.withResult(score(70, 80)))),
      );
      expect(
        onOlympiacos(rules).withPick(
          team('BAR'),
          context(scored, monday),
          rules,
        ),
      ).toEqual(refuse('round-already-scored'));
    });
  }
});

describe('SU-5', () => {
  // Twenty teams T1..T20. Round r: Tr at home to the next team, and wins.
  const name = (n: number) => `T${String(((n - 1) % 20) + 1)}`;
  const gameOf = (round: number, result: boolean) =>
    makeGame({
      id: round,
      round,
      home: name(round),
      away: name(round + 1),
      tipOff: new Date(Date.UTC(2026, 9, round, 18))
        .toISOString()
        .replace('.000', ''),
      ...(result ? { result: [90, 80] as const } : {}),
    });
  const seasonUpTo = (current: number) =>
    seasonOf(
      Array.from({ length: current }, (_, index) =>
        makeRound({ number: index + 1 }),
      ),
      Array.from({ length: current }, (_, index) =>
        gameOf(index + 1, index + 1 < current),
      ),
    );
  const beforeRound = (round: number) =>
    new Date(Date.UTC(2026, 9, round, 12)).toISOString().replace('.000', '');
  const picks = (count: number): SurvivalPick[] =>
    Array.from({ length: count }, (_, index) => ({
      round: roundNo(index + 1),
      team: team(name(index + 1)),
    }));

  it('survival (ruled): a team used in this run is refused', () => {
    const run = unwrap(SurvivalRun.stored(picks(1)));
    expect(
      run.withPick(
        team('T1'),
        context(seasonUpTo(2), beforeRound(2)),
        ruledRules,
      ),
    ).toEqual(refuse('team-used-in-run'));
  });

  it('survival (ruled): after all 20 teams the list resets', () => {
    const nineteen = unwrap(SurvivalRun.stored(picks(19)));
    const round20 = context(seasonUpTo(20), beforeRound(20));
    expect(nineteen.withPick(team('T1'), round20, ruledRules)).toEqual(
      refuse('team-used-in-run'),
    );
    const twenty = unwrap(nineteen.withPick(team('T20'), round20, ruledRules));
    const round21 = context(seasonUpTo(21), beforeRound(21));
    const again = unwrap(twenty.withPick(team('T1'), round21, ruledRules));
    expect(picked(again).slice(-2)).toEqual(['20:T20', '21:T1']);
  });

  it('survival (ruled): a loss frees every team again', () => {
    // T1 won round 1; round 2's pick, T3, lost at T2's home.
    const lostRun = unwrap(
      SurvivalRun.stored([
        ...picks(1),
        { round: roundNo(2), team: team('T3') },
      ]),
    );
    expect(
      lostRun.withPick(
        team('T1'),
        context(seasonUpTo(3), beforeRound(3)),
        ruledRules,
      ).ok,
    ).toBe(true);
  });

  it('survival (sportbet): re-picking a used team moves its earlier pick', () => {
    // Home wins in rounds 1-4, round 1 on T1. In round 5 T1 is picked again:
    // T1 plays away at T5 and wins.
    const four = unwrap(SurvivalRun.stored(picks(4)));
    const round5 = seasonOf(
      Array.from({ length: 5 }, (_, index) => makeRound({ number: index + 1 })),
      [
        ...Array.from({ length: 4 }, (_, index) => gameOf(index + 1, true)),
        makeGame({
          id: 5,
          round: 5,
          home: 'T5',
          away: 'T1',
          tipOff: '2026-10-05T18:00:00Z',
        }),
      ],
    );
    const repicked = unwrap(
      four.withPick(team('T1'), context(round5, beforeRound(5)), sportbetRules),
    );
    expect(
      four.withPick(team('T1'), context(round5, beforeRound(5)), ruledRules),
    ).toEqual(refuse('team-used-in-run'));
    const game5 = round5.games[4];
    const played =
      game5 === undefined
        ? round5.games
        : unwrap(round5.withGame(unwrap(game5.withResult(score(80, 90)))))
            .games;
    expect(
      survivalAtResultEntry(repicked.picks, played).map((row) =>
        row.points?.toString(),
      ),
    ).toEqual(['10.00', '20.00', '30.00', '40.00', '42.00']);
  });
});

describe('SU-7', () => {
  it.each(bothSets)(
    'survival: a round without survival takes no pick (%s)',
    (_, rules) => {
      const season = seasonOf(
        [makeRound({ number: 1, survival: false }, rules)],
        [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-02T18:00:00Z',
          }),
        ],
      );
      expect(
        SurvivalRun.EMPTY.withPick(
          team('ZAL'),
          context(season, '2026-10-01T12:00:00Z'),
          rules,
        ),
      ).toEqual(refuse('round-has-no-survival'));
    },
  );
});

describe('SU-8', () => {
  // Round 8: Baskonia's game (11-13) was postponed without a new date and
  // has no result; round 9 starts 11-18.
  const season = seasonOf(
    [makeRound({ number: 8 }), makeRound({ number: 9 })],
    [
      makeGame({
        id: 1,
        round: 8,
        home: 'ZAL',
        away: 'BAS',
        tipOff: '2026-11-13T18:00:00Z',
      }),
      makeGame({
        id: 2,
        round: 9,
        home: 'MON',
        away: 'PAR',
        tipOff: '2026-11-18T18:00:00Z',
      }),
    ],
  );
  const waiting = unwrap(
    SurvivalRun.stored([{ round: roundNo(8), team: team('BAS') }]),
  );
  const nov17 = context(season, '2026-11-17T12:00:00Z');

  it('survival (ruled): later rounds can be picked while a pick waits', () => {
    const next = unwrap(waiting.withPick(team('MON'), nov17, ruledRules));
    expect(picked(next)).toEqual(['8:BAS', '9:MON']);
  });

  it('survival (sportbet): the postponed round holds every pick', () => {
    // The current round is still 8 (LR-3), so a pick made on 11-17 is
    // round 8's, never round 9's.
    expect(season.currentRound(nov17.now, sportbetRules)).toBe(8);
    const next = unwrap(waiting.withPick(team('MON'), nov17, sportbetRules));
    expect(next.picks.map((pick) => pick.round)).toEqual([8]);
  });
});

describe('LR-4', () => {
  it('rate: survival and standings are not multiplied', () => {
    // A survival round at rate 2 (sportbet lets an admin set it): an away
    // win still pays 12. Standings scoring takes no rate at all.
    const game = makeGame({
      id: 1,
      round: 1,
      home: 'REA',
      away: 'FEN',
      tipOff: '2026-10-02T18:00:00Z',
    });
    const season = seasonOf([makeRound({ number: 1, rate: 2 })], [game]);
    const run = unwrap(
      SurvivalRun.EMPTY.withPick(
        team('FEN'),
        context(season, '2026-10-01T12:00:00Z'),
        sportbetRules,
      ),
    );
    const played = unwrap(game.withResult(score(70, 95)));
    expect(
      foldSurvival(run.picks, [played]).map((row) => row.points?.toString()),
    ).toEqual(['12.00']);
  });
});

describe('SurvivalRun.stored', () => {
  it('refuses two picks in one round', () => {
    expect(
      SurvivalRun.stored([
        { round: roundNo(1), team: team('ZAL') },
        { round: roundNo(1), team: team('OLY') },
      ]),
    ).toEqual(refuse('two-picks-in-one-round'));
  });

  it('has no pick with no current round', () => {
    // A round declared but with no games at all: R-40's fallback has no
    // game to fall back to either.
    const noGames = seasonOf([makeRound({ number: 1 })], []);
    expect(
      SurvivalRun.EMPTY.withPick(
        team('ZAL'),
        context(noGames, '2026-10-03T12:00:00Z'),
        ruledRules,
      ),
    ).toEqual(refuse('no-current-round'));
  });
});

describe('R-41: a survival team stays open until its own game starts', () => {
  // Round 8: Zalgiris - Olympiacos is played on 11-12; Baskonia - Partizan
  // (11-13) is postponed on 11-12, before its tip-off, and on 12-01 given
  // 12-10, so R-13 reopens it for match predictions. Round 9 is played on
  // 11-18.
  const zalOly = makeGame({
    id: 1,
    round: 8,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2026-11-12T18:00:00Z',
  });
  const basPar = makeGame({
    id: 2,
    round: 8,
    home: 'BAS',
    away: 'PAR',
    tipOff: '2026-11-13T18:00:00Z',
  });
  const monVir = makeGame({
    id: 3,
    round: 9,
    home: 'MON',
    away: 'VIR',
    tipOff: '2026-11-18T18:00:00Z',
    result: [80, 70],
  });
  const rounds = [makeRound({ number: 8 }), makeRound({ number: 9 })];
  const before = seasonOf(rounds, [zalOly, basPar, monVir]);
  const december = seasonOf(rounds, [
    unwrap(zalOly.withResult(score(88, 79))),
    unwrap(basPar.postpone(at('2026-11-12T10:00:00Z'), ruledRules)).reschedule(
      at('2026-12-10T18:00:00Z'),
      at('2026-12-01T12:00:00Z'),
      ruledRules,
    ),
    monVir,
  ]);
  const dec5 = context(december, '2026-12-05T12:00:00Z');
  const onPartizan = unwrap(
    SurvivalRun.EMPTY.withPick(
      team('PAR'),
      context(before, '2026-11-11T12:00:00Z'),
      ruledRules,
    ),
  );

  it('survival (ruled): the reopened game is round 8, open for match predictions', () => {
    expect(december.currentRound(dec5.now, ruledRules)).toBe(8);
    expect(december.game(basPar.id)?.isOpenAt(dec5.now)).toBe(true);
  });

  // The owner's ruling of 2026-10-06 (#17), following sportbet#297: the
  // round no longer closes at its first tip-off, in either set.
  for (const [set, rules] of bothSets) {
    it(`survival (${set}): a team whose own game has been played stays closed`, () => {
      expect(SurvivalRun.EMPTY.withPick(team('ZAL'), dec5, rules)).toEqual(
        refuse('team-already-started'),
      );
    });

    it(`survival (${set}): a player without a round-8 pick can add one on the reopened game in December`, () => {
      expect(december.currentRound(dec5.now, rules)).toBe(8);
      expect(
        picked(unwrap(SurvivalRun.EMPTY.withPick(team('BAS'), dec5, rules))),
      ).toEqual(['8:BAS']);
    });

    it(`survival (${set}): a player whose round-8 pick has not tipped off can change it in December`, () => {
      expect(picked(onPartizan)).toEqual(['8:PAR']);
      expect(
        picked(unwrap(onPartizan.withPick(team('BAS'), dec5, rules))),
      ).toEqual(['8:BAS']);
    });

    it(`survival (${set}): the round stays open at the second of its first tip-off`, () => {
      expect(
        picked(
          unwrap(
            onPartizan.withPick(
              team('BAS'),
              context(before, '2026-11-12T18:00:00Z'),
              rules,
            ),
          ),
        ),
      ).toEqual(['8:BAS']);
    });
  }
});

describe('R-11: the season decides how many teams there are', () => {
  it("survival (ruled): the used list resets after every one of the season's teams", () => {
    // Three teams: A beats B, B beats C, C beats A, each at home, rounds 1-3.
    const games = [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
      ['A', 'B'],
    ].map(([home, away], index) =>
      makeGame({
        id: index + 1,
        round: index + 1,
        home: home ?? 'A',
        away: away ?? 'B',
        tipOff: `2026-10-0${String(index + 1)}T18:00:00Z`,
        ...(index < 3 ? { result: [90, 80] as const } : {}),
      }),
    );
    const season = seasonOf(
      [1, 2, 3, 4].map((number) => makeRound({ number })),
      games,
    );
    const run = unwrap(
      SurvivalRun.stored([
        { round: roundNo(1), team: team('A') },
        { round: roundNo(2), team: team('B') },
        { round: roundNo(3), team: team('C') },
      ]),
    );
    const again = unwrap(
      run.withPick(
        team('A'),
        context(season, '2026-10-04T12:00:00Z'),
        ruledRules,
      ),
    );
    expect(picked(again)).toEqual(['1:A', '2:B', '3:C', '4:A']);
  });
});
