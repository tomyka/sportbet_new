import { describe, expect, it } from 'vitest';
import type { Game } from '../round/game';
import { Round } from '../round/round';
import { Season } from '../round/season';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import { refuse } from '../shared/result';
import {
  at,
  makeGame,
  makeRound,
  rate,
  roundNo,
  score,
  team,
  unwrap,
} from '../testing';
import { foldSurvival, type SurvivalPick } from './survival-fold';
import { SurvivalRun, usedTeams, type PickContext } from './survival-run';

const END = at('2027-05-31T00:00:00Z');
const seasonOf = (rounds: readonly Round[], games: readonly Game[]) =>
  unwrap(Season.create({ rounds, games, endsAt: END }));
const context = (
  season: Season,
  now: string,
  extra?: Partial<PickContext>,
): PickContext => ({
  season,
  teams: season.teams(),
  survivalPlayed: true,
  now: at(now),
  ...extra,
});
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

  for (const [set, rules] of bothSets) {
    it(`survival (${set}): a pick cannot change after its team tips off (R-4, R-81)`, () => {
      expect(
        onOlympiacos(rules).withPick(
          team('BAR'),
          context(season, halfTime),
          rules,
        ),
      ).toEqual(refuse('pick-locked'));
    });

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

describe('SurvivalRun.refusalsFor', () => {
  // Round 1: Olympiacos play Tuesday, Barcelona Thursday; XXX has no game.
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
  const halfTime = '2026-10-06T19:00:00Z';
  const every = [team('OLY'), team('BAR'), team('XXX')];

  for (const [set, rules] of bothSets) {
    it(`survival (${set}): every failing question per team, in withPick's order; the first is withPick's answer`, () => {
      const ctx = context(season, halfTime, {
        teams: [...season.teams(), team('XXX')],
      });
      const onOly = unwrap(
        SurvivalRun.EMPTY.withPick(
          team('OLY'),
          context(season, '2026-10-05T12:00:00Z'),
          rules,
        ),
      );
      const refusals = onOly.refusalsFor(every, ctx, rules);
      expect(refusals.get(team('OLY'))).toEqual([
        'team-already-started',
        'pick-locked',
      ]);
      expect(refusals.get(team('BAR'))).toEqual(['pick-locked']);
      expect(refusals.get(team('XXX'))).toEqual([
        'team-not-playing',
        'pick-locked',
      ]);
      expect(onOly.withPick(team('OLY'), ctx, rules)).toEqual(
        refuse('team-already-started'),
      );
      expect(onOly.withPick(team('BAR'), ctx, rules)).toEqual(
        refuse('pick-locked'),
      );
      expect(onOly.withPick(team('XXX'), ctx, rules)).toEqual(
        refuse('team-not-playing'),
      );
    });

    it(`survival (${set}): a team not in the tournament, and no current round`, () => {
      const none = seasonOf([makeRound({ number: 1 })], []);
      expect(
        SurvivalRun.EMPTY.refusalsFor(
          [team('OLY')],
          context(none, halfTime, { teams: [] }),
          rules,
        ).get(team('OLY')),
      ).toEqual(['unknown-team', 'no-current-round']);
      expect(
        SurvivalRun.EMPTY.refusalsFor(
          [team('OLY')],
          context(none, halfTime, { teams: [team('OLY')] }),
          rules,
        ).get(team('OLY')),
      ).toEqual(['no-current-round']);
    });

    it(`survival (${set}): a team used in the run is refused as used, a free one accepted`, () => {
      const two = seasonOf(
        [1, 2].map((number) => makeRound({ number })),
        [
          makeGame({
            id: 5,
            round: 1,
            home: 'OLY',
            away: 'MON',
            tipOff: '2026-10-06T18:00:00Z',
            result: [90, 80],
          }),
          makeGame({
            id: 6,
            round: 2,
            home: 'OLY',
            away: 'BAR',
            tipOff: '2026-10-13T18:00:00Z',
          }),
          makeGame({
            id: 7,
            round: 2,
            home: 'REA',
            away: 'MON',
            tipOff: '2026-10-13T18:00:00Z',
          }),
        ],
      );
      const run = unwrap(
        SurvivalRun.stored([{ round: roundNo(1), team: team('OLY') }]),
      );
      const refusals = run.refusalsFor(
        [team('OLY'), team('BAR')],
        context(two, '2026-10-12T12:00:00Z'),
        rules,
      );
      expect(refusals.get(team('OLY'))).toEqual(['team-used-in-run']);
      expect(refusals.get(team('BAR'))).toEqual([]);
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
  const seasonUpTo = (current: number, ...extra: readonly Game[]) =>
    seasonOf(
      Array.from({ length: current }, (_, index) =>
        makeRound({ number: index + 1 }),
      ),
      [
        ...Array.from({ length: current }, (_, index) =>
          gameOf(index + 1, index + 1 < current),
        ),
        ...extra,
      ],
    );
  // T1 also plays in round `round`, away at T`host`.
  const t1Away = (round: number, host: number) =>
    makeGame({
      id: 100 + round,
      round,
      home: `T${String(host)}`,
      away: 'T1',
      tipOff: new Date(Date.UTC(2026, 9, round, 18))
        .toISOString()
        .replace('.000', ''),
    });
  const beforeRound = (round: number) =>
    new Date(Date.UTC(2026, 9, round, 12)).toISOString().replace('.000', '');
  const picks = (count: number): SurvivalPick[] =>
    Array.from({ length: count }, (_, index) => ({
      round: roundNo(index + 1),
      team: team(name(index + 1)),
    }));

  for (const [set, rules] of bothSets) {
    it(`survival (${set}): a team used in this run is refused (R-11, R-81)`, () => {
      const run = unwrap(SurvivalRun.stored(picks(1)));
      expect(
        run.withPick(
          team('T1'),
          context(seasonUpTo(2, t1Away(2, 4)), beforeRound(2)),
          rules,
        ),
      ).toEqual(refuse('team-used-in-run'));
    });

    it(`survival (${set}): after all 20 teams the list resets (R-11, R-81)`, () => {
      const nineteen = unwrap(SurvivalRun.stored(picks(19)));
      const round20 = context(seasonUpTo(20), beforeRound(20));
      expect(nineteen.withPick(team('T1'), round20, rules)).toEqual(
        refuse('team-used-in-run'),
      );
      const twenty = unwrap(nineteen.withPick(team('T20'), round20, rules));
      const round21 = context(seasonUpTo(21), beforeRound(21));
      const again = unwrap(twenty.withPick(team('T1'), round21, rules));
      expect(picked(again).slice(-2)).toEqual(['20:T20', '21:T1']);
    });

    it(`survival (${set}): a loss frees every team again (R-11, R-81)`, () => {
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
          context(seasonUpTo(3, t1Away(3, 5)), beforeRound(3)),
          rules,
        ).ok,
      ).toBe(true);
    });
  }
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
    // The current round is still 8 (LR-3), so a round-9 team is refused:
    // it plays no game in round 8 (R-81).
    expect(season.currentRound(nov17.now, sportbetRules)).toBe(8);
    expect(waiting.withPick(team('MON'), nov17, sportbetRules)).toEqual(
      refuse('team-not-playing'),
    );
  });
});

describe('LR-4', () => {
  it('rate: survival and standings are not multiplied', () => {
    // A survival round at rate 2 (sportbet lets an admin set it): an away
    // win still pays 12, doubled (R-138). Standings scoring takes no rate at
    // all.
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
    ).toEqual(['24.00']);
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
        context(noGames, '2026-10-03T12:00:00Z', { teams: [team('ZAL')] }),
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

describe("withPick: sportbet's questions in its order (SurvivalPick::decide)", () => {
  // Round 1. A-B tips off Tuesday; C-D Thursday; E-F Thursday, its result
  // entered ahead of the tip-off; G-H was due Monday 10:00, postponed on
  // Sunday, before its tip-off. X is a team of the tournament with no game.
  const ab = makeGame({
    id: 1,
    round: 1,
    home: 'A',
    away: 'B',
    tipOff: '2026-10-06T18:00:00Z',
  });
  const cd = makeGame({
    id: 2,
    round: 1,
    home: 'C',
    away: 'D',
    tipOff: '2026-10-08T18:00:00Z',
  });
  const ef = makeGame({
    id: 3,
    round: 1,
    home: 'E',
    away: 'F',
    tipOff: '2026-10-08T18:00:00Z',
    result: [80, 70],
  });
  const gh = unwrap(
    makeGame({
      id: 4,
      round: 1,
      home: 'G',
      away: 'H',
      tipOff: '2026-10-05T10:00:00Z',
    }).postpone(at('2026-10-04T12:00:00Z'), ruledRules),
  );
  const season = seasonOf([makeRound({ number: 1 })], [ab, cd, ef, gh]);
  const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'].map(team);
  const sunday = '2026-10-04T18:00:00Z';
  const monday = '2026-10-05T12:00:00Z';
  const halfTime = '2026-10-06T19:00:00Z';
  const inRound = (now: string, extra?: Partial<PickContext>) =>
    context(season, now, { teams, ...extra });
  const onA = unwrap(
    SurvivalRun.stored([{ round: roundNo(1), team: team('A') }]),
  );

  for (const [set, rules] of bothSets) {
    it(`survival (${set}): unknown-team - a team not of the tournament is refused`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(team('Z'), inRound(monday), rules),
      ).toEqual(refuse('unknown-team'));
    });

    it(`survival (${set}): no-current-round - nothing to pick for without a game`, () => {
      const noGames = seasonOf([makeRound({ number: 1 })], []);
      expect(
        SurvivalRun.EMPTY.withPick(
          team('A'),
          context(noGames, monday, { teams }),
          rules,
        ),
      ).toEqual(refuse('no-current-round'));
    });

    it(`survival (${set}): round-changed - a page that names a round that moved on is refused`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(
          team('C'),
          inRound(monday, { shownRound: roundNo(2) }),
          rules,
        ),
      ).toEqual(refuse('round-changed'));
    });

    it(`survival (${set}): a post that names its round, or no round, is judged on the current one`, () => {
      for (const extra of [{ shownRound: roundNo(1) }, {}]) {
        const run = unwrap(
          SurvivalRun.EMPTY.withPick(team('C'), inRound(monday, extra), rules),
        );
        expect(picked(run)).toEqual(['1:C']);
      }
    });

    it(`survival (${set}): round-has-no-survival - a tournament without survival refuses every pick`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(
          team('C'),
          inRound(monday, { survivalPlayed: false }),
          rules,
        ),
      ).toEqual(refuse('round-has-no-survival'));
    });

    it(`survival (${set}): round-already-scored - a scored round's pick cannot change`, () => {
      const scored = unwrap(
        season.withGame(unwrap(ab.withResult(score(90, 80)))),
      );
      expect(
        onA.withPick(team('C'), context(scored, monday, { teams }), rules),
      ).toEqual(refuse('round-already-scored'));
    });

    it(`survival (${set}): team-not-playing - a team with no game in the round is refused (R-81)`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(team('X'), inRound(monday), rules),
      ).toEqual(refuse('team-not-playing'));
    });

    it(`survival (${set}): team-already-started - a team whose game has tipped off is refused`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(team('B'), inRound(halfTime), rules),
      ).toEqual(refuse('team-already-started'));
    });

    it(`survival (${set}): a team whose game has a result before its tip-off is refused (R-81, LR-1)`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(team('F'), inRound(monday), rules),
      ).toEqual(refuse('team-already-started'));
    });

    it(`survival (${set}): a postponed game's team cannot be picked`, () => {
      expect(
        SurvivalRun.EMPTY.withPick(team('G'), inRound(monday), rules),
      ).toEqual(refuse('team-already-started'));
    });

    it(`survival (${set}): pick-locked - the pick cannot move once its game tips off (R-4)`, () => {
      expect(onA.withPick(team('C'), inRound(halfTime), rules)).toEqual(
        refuse('pick-locked'),
      );
    });

    it(`survival (${set}): a pick on a game postponed before its tip-off can still change (R-4, the clock)`, () => {
      // H was picked before G-H was postponed; its original tip-off has
      // passed by Monday noon.
      const onH = unwrap(
        SurvivalRun.stored([{ round: roundNo(1), team: team('H') }]),
      );
      expect(
        picked(unwrap(onH.withPick(team('C'), inRound(sunday), rules))),
      ).toEqual(['1:C']);
      expect(
        picked(unwrap(onH.withPick(team('C'), inRound(monday), rules))),
      ).toEqual(['1:C']);
    });

    it(`survival (${set}): re-posting the current pick is accepted and changes nothing`, () => {
      const again = unwrap(onA.withPick(team('A'), inRound(monday), rules));
      expect(picked(again)).toEqual(['1:A']);
    });

    it(`survival (${set}): refusals come in sportbet's order`, () => {
      // Round 2: X won round 1 and plays no game in round 2, so a pick of
      // X is both not playing (6) and used (9); 6 answers. A started team
      // is refused before the pick lock (7 before 8); an unknown team, a
      // moved round and a round without survival come first (1, 3, 4).
      const twoRounds = seasonOf(
        [makeRound({ number: 1 }), makeRound({ number: 2 })],
        [
          makeGame({
            id: 1,
            round: 1,
            home: 'X',
            away: 'A',
            tipOff: '2026-10-01T18:00:00Z',
            result: [90, 80],
          }),
          makeGame({
            id: 2,
            round: 2,
            home: 'B',
            away: 'C',
            tipOff: '2026-10-08T18:00:00Z',
          }),
          makeGame({
            id: 3,
            round: 2,
            home: 'D',
            away: 'E',
            tipOff: '2026-10-06T18:00:00Z',
          }),
        ],
      );
      const onX = unwrap(
        SurvivalRun.stored([
          { round: roundNo(1), team: team('X') },
          { round: roundNo(2), team: team('D') },
        ]),
      );
      const ctx = (now: string, extra?: Partial<PickContext>) =>
        context(twoRounds, now, { teams, ...extra });
      const allWrong = { shownRound: roundNo(1), survivalPlayed: false };
      expect(onX.withPick(team('X'), ctx(monday), rules)).toEqual(
        refuse('team-not-playing'),
      );
      expect(onX.withPick(team('E'), ctx(halfTime), rules)).toEqual(
        refuse('team-already-started'),
      );
      expect(onX.withPick(team('B'), ctx(halfTime), rules)).toEqual(
        refuse('pick-locked'),
      );
      expect(onX.withPick(team('Z'), ctx(halfTime, allWrong), rules)).toEqual(
        refuse('unknown-team'),
      );
      expect(onX.withPick(team('X'), ctx(halfTime, allWrong), rules)).toEqual(
        refuse('round-changed'),
      );
      expect(
        onX.withPick(
          team('X'),
          ctx(halfTime, { survivalPlayed: false }),
          rules,
        ),
      ).toEqual(refuse('round-has-no-survival'));
    });

    it(`survival (${set}): the used list resets after the tournament's team list, a team without a game included (R-81)`, () => {
      // Four teams; D plays no game. A beats B, B beats C, C beats A, each
      // at home in rounds 1-3. After A, B and C, A is still used: D is one
      // of the four.
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
      const fourRounds = seasonOf(
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
      const now = '2026-10-04T12:00:00Z';
      const four = ['A', 'B', 'C', 'D'].map(team);
      expect(
        run.withPick(
          team('A'),
          context(fourRounds, now, { teams: four }),
          rules,
        ),
      ).toEqual(refuse('team-used-in-run'));
      const three = ['A', 'B', 'C'].map(team);
      expect(
        picked(
          unwrap(
            run.withPick(
              team('A'),
              context(fourRounds, now, { teams: three }),
              rules,
            ),
          ),
        ),
      ).toEqual(['1:A', '2:B', '3:C', '4:A']);
    });
  }

  it('survival: a pending pick counts as used (R-11, R-12)', () => {
    // Round 1's pick on C has no result yet; round 2's list holds it.
    const twoRounds = seasonOf(
      [makeRound({ number: 1 }), makeRound({ number: 2 })],
      [
        cd,
        makeGame({
          id: 9,
          round: 2,
          home: 'A',
          away: 'C',
          tipOff: '2026-10-15T18:00:00Z',
        }),
      ],
    );
    const onC = unwrap(
      SurvivalRun.stored([{ round: roundNo(1), team: team('C') }]),
    );
    expect([
      ...usedTeams(onC, { season: twoRounds, teams }, roundNo(2)),
    ]).toEqual([team('C')]);
    // The round's own pick is left out.
    expect([
      ...usedTeams(onC, { season: twoRounds, teams }, roundNo(1)),
    ]).toEqual([]);
  });

  it('survival: a playoff round carries no survival, even stored with the flag (SU-7, R-10)', () => {
    const playoff = Round.stored({
      number: roundNo(39),
      stage: 'play-offs',
      rate: rate(1),
      survival: true,
      knockout: false,
    });
    const r39 = seasonOf(
      [playoff],
      [
        makeGame({
          id: 39,
          round: 39,
          home: 'A',
          away: 'B',
          tipOff: '2027-04-20T18:00:00Z',
        }),
      ],
    );
    const now = '2027-04-19T12:00:00Z';
    expect(
      SurvivalRun.EMPTY.withPick(
        team('A'),
        context(r39, now, { teams }),
        ruledRules,
      ),
    ).toEqual(refuse('round-has-no-survival'));
  });
});
