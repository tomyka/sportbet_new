import { describe, expect, it } from 'vitest';
import { pointsWhole } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { Game } from '../round/game';
import type { Round } from '../round/round';
import { Season } from '../round/season';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import {
  at,
  makeGame,
  makeRound,
  player,
  roundNo,
  team,
  unwrap,
} from '../testing';
import { survivalPickPage, type SurvivalPickPage } from './survival-page';
import { SurvivalRun } from './survival-run';

const END = at('2027-05-31T00:00:00Z');
const seasonOf = (rounds: readonly Round[], games: readonly Game[]) =>
  unwrap(Season.create({ rounds, games, endsAt: END }));
const bothSets = [
  ['sportbet', sportbetRules],
  ['ruled', ruledRules],
] as const;
const ME = player('7');
const row = (
  round: number,
  teamId: string,
  points: number,
  provisional = false,
): SurvivalPoints => ({
  player: ME,
  round: roundNo(round),
  team: team(teamId),
  points: pointsWhole(points),
  provisional,
  storedId: null,
});
const runOf = (...picks: readonly [number, string][]) =>
  unwrap(
    SurvivalRun.stored(
      picks.map(([round, teamId]) => ({
        round: roundNo(round),
        team: team(teamId),
      })),
    ),
  );
const open = (page: SurvivalPickPage) => {
  if (page.kind !== 'open') throw new Error('the page is over');
  return page;
};

// Round 1: A beat B, A picked (10 stored). Round 2, the current one on
// Monday noon: C-A (A away), D-E, F-G (tipped off Monday 10:00), H-B. X is
// a team of the tournament with no game.
const round1 = makeGame({
  id: 1,
  round: 1,
  home: 'A',
  away: 'B',
  tipOff: '2026-10-06T18:00:00Z',
  result: [90, 80],
});
const ca = makeGame({
  id: 2,
  round: 2,
  home: 'C',
  away: 'A',
  tipOff: '2026-10-13T18:00:00Z',
});
const de = makeGame({
  id: 3,
  round: 2,
  home: 'D',
  away: 'E',
  tipOff: '2026-10-15T18:00:00Z',
});
const fg = makeGame({
  id: 4,
  round: 2,
  home: 'F',
  away: 'G',
  tipOff: '2026-10-12T10:00:00Z',
});
const hb = makeGame({
  id: 5,
  round: 2,
  home: 'H',
  away: 'B',
  tipOff: '2026-10-15T18:00:00Z',
});
const season = seasonOf(
  [makeRound({ number: 1 }), makeRound({ number: 2 })],
  [round1, ca, de, fg, hb],
);
const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'].map(team);
const MONDAY = at('2026-10-12T12:00:00Z');
const pageOf = (
  run: SurvivalRun,
  rows: readonly SurvivalPoints[],
  rules: RuleSet,
  extra?: Partial<Parameters<typeof survivalPickPage>[0]>,
) =>
  survivalPickPage({
    season,
    teams,
    survivalPlayed: true,
    run,
    rows,
    rules,
    now: MONDAY,
    ...extra,
  });
const cardsOf = (page: SurvivalPickPage) =>
  open(page).cards.map(
    (card) =>
      `${card.team}:${card.state.kind}${card.state.kind === 'used' ? String(card.state.round) : ''}:${card.selectable ? 'pick' : 'no'}${card.picked ? ':picked' : ''}`,
  );

describe('survivalPickPage', () => {
  for (const [set, rules] of bothSets) {
    it(`survival page (${set}): one card per team playing in the round, by team id, each with its state`, () => {
      const page = pageOf(runOf([1, 'A']), [row(1, 'A', 10)], rules);
      expect(cardsOf(page)).toEqual([
        'A:used1:no',
        'B:open:pick',
        'C:open:pick',
        'D:open:pick',
        'E:open:pick',
        'F:started:no',
        'G:started:no',
        'H:open:pick',
      ]);
      expect(open(page).round).toBe(2);
      expect(open(page).free).toBe(7);
      expect(open(page).used).toBe(1);
    });

    it(`survival page (${set}): each card's opponent and ground`, () => {
      const cards = open(pageOf(SurvivalRun.EMPTY, [], rules)).cards;
      expect(
        cards.map((card) => `${card.team}-${card.opponent}-${card.ground}`),
      ).toEqual([
        'A-C-away',
        'B-H-away',
        'C-A-home',
        'D-E-home',
        'E-D-away',
        'F-G-home',
        'G-F-away',
        'H-B-home',
      ]);
    });

    it(`survival page (${set}): selectable equals withPick for every card (sportbet issue 292)`, () => {
      const fixtures: readonly [SurvivalRun, readonly SurvivalPoints[]][] = [
        [SurvivalRun.EMPTY, []],
        [runOf([1, 'A']), [row(1, 'A', 10)]],
        [runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)]],
        [runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10)]],
        [runOf([1, 'B']), [row(1, 'B', 0)]],
      ];
      for (const [run, rows] of fixtures) {
        for (const card of open(pageOf(run, rows, rules)).cards) {
          const accepted = run.withPick(
            card.team,
            { season, teams, survivalPlayed: true, now: MONDAY },
            rules,
          ).ok;
          expect([card.team, card.selectable]).toEqual([card.team, accepted]);
        }
      }
    });

    it(`survival page (${set}): the held pick is marked and the round still open for a choice`, () => {
      const page = open(
        pageOf(runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)], rules),
      );
      expect(page.picked).toBe('D');
      expect(
        page.cards.filter((card) => card.picked).map((card) => card.team),
      ).toEqual(['D']);
      expect(page.choosing).toBe(true);
      expect(page.pickLocked).toBe(false);
      expect(page.verdict).toBeNull();
    });

    it(`survival page (${set}): a pick whose game has tipped off locks every card (R-4)`, () => {
      const page = open(
        pageOf(runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10)], rules),
      );
      expect(page.pickLocked).toBe(true);
      expect(page.cards.some((card) => card.selectable)).toBe(false);
      expect(page.choosing).toBe(false);
    });

    it(`survival page (${set}): no pick, no lock`, () => {
      const page = open(pageOf(SurvivalRun.EMPTY, [], rules));
      expect(page.picked).toBeNull();
      expect(page.pickLocked).toBe(false);
    });

    it(`survival page (${set}): the round's verdict, survived and lost`, () => {
      const run = runOf([1, 'A'], [2, 'D']);
      expect(
        open(pageOf(run, [row(1, 'A', 10), row(2, 'D', 20)], rules)).verdict,
      ).toEqual({
        state: 'survived',
        points: pointsWhole(20),
      });
      const lost = open(pageOf(run, [row(1, 'A', 10), row(2, 'D', 0)], rules));
      expect(lost.verdict).toEqual({ state: 'lost' });
      expect(lost.choosing).toBe(false);
    });

    it(`survival page (${set}): the run before the round, its streak, its points and the stake`, () => {
      const page = open(
        pageOf(runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)], rules),
      );
      expect(
        page.run.map(
          (line) => `${String(line.round)}:${line.team}:${line.state}`,
        ),
      ).toEqual(['1:A:survived']);
      expect(page.streak).toBe(1);
      expect(page.runPoints).toEqual(pointsWhole(10));
      expect(page.stake).toEqual({ home: 20, away: 22 });
    });

    it(`survival page (${set}): a loss empties the run and the stake starts over`, () => {
      const page = open(pageOf(runOf([1, 'B']), [row(1, 'B', 0)], rules));
      expect(page.run).toEqual([]);
      expect(page.streak).toBe(0);
      expect(page.runPoints).toEqual(pointsWhole(0));
      expect(page.stake).toEqual({ home: 10, away: 12 });
      // The loss freed B.
      expect(cardsOf(page)).toContain('B:open:pick');
    });

    it(`survival page (${set}): after every team is used, every card is open again (R-11)`, () => {
      // Two teams: A beat B in round 1 (A picked), B beat A in round 2 (B
      // picked); round 3 is A-B.
      const two = seasonOf(
        [1, 2, 3].map((number) => makeRound({ number })),
        [
          round1,
          makeGame({
            id: 6,
            round: 2,
            home: 'B',
            away: 'A',
            tipOff: '2026-10-09T18:00:00Z',
            result: [90, 80],
          }),
          makeGame({
            id: 7,
            round: 3,
            home: 'A',
            away: 'B',
            tipOff: '2026-10-15T18:00:00Z',
          }),
        ],
      );
      const page = survivalPickPage({
        season: two,
        teams: [team('A'), team('B')],
        survivalPlayed: true,
        run: runOf([1, 'A'], [2, 'B']),
        rows: [row(1, 'A', 10), row(2, 'B', 20)],
        rules,
        now: MONDAY,
      });
      expect(cardsOf(page)).toEqual(['A:open:pick', 'B:open:pick']);
      expect(open(page).free).toBe(2);
      expect(open(page).used).toBe(0);
    });

    it(`survival page (${set}): over with no current round`, () => {
      const empty = seasonOf([makeRound({ number: 1 })], []);
      expect(pageOf(SurvivalRun.EMPTY, [], rules, { season: empty })).toEqual({
        kind: 'over',
      });
    });

    it(`survival page (${set}): over in a round without survival`, () => {
      const noSurvival = seasonOf(
        [makeRound({ number: 1 }), makeRound({ number: 2, survival: false })],
        [round1, ca],
      );
      expect(
        pageOf(SurvivalRun.EMPTY, [], rules, { season: noSurvival }),
      ).toEqual({ kind: 'over' });
    });

    it(`survival page (${set}): over in a tournament without survival`, () => {
      expect(
        pageOf(SurvivalRun.EMPTY, [], rules, { survivalPlayed: false }),
      ).toEqual({ kind: 'over' });
    });
  }

  it('survival page (ruled): a pending earlier pick shows in the run but not in the streak (R-12)', () => {
    // Round 2's pick on E waits (D-E postponed); round 3 is current.
    const waiting = seasonOf(
      [1, 2, 3].map((number) => makeRound({ number })),
      [
        round1,
        unwrap(de.postpone(at('2026-10-14T12:00:00Z'), ruledRules)),
        makeGame({
          id: 8,
          round: 3,
          home: 'C',
          away: 'A',
          tipOff: '2026-10-20T18:00:00Z',
        }),
      ],
    );
    const page = open(
      survivalPickPage({
        season: waiting,
        teams,
        survivalPlayed: true,
        run: runOf([1, 'A'], [2, 'E']),
        rows: [row(1, 'A', 10)],
        rules: ruledRules,
        now: at('2026-10-16T12:00:00Z'),
      }),
    );
    expect(page.round).toBe(3);
    expect(
      page.run.map((line) => `${String(line.round)}:${line.state}`),
    ).toEqual(['1:survived', '2:pending']);
    expect(page.streak).toBe(1);
    expect(page.runPoints).toEqual(pointsWhole(10));
    expect(page.stake).toEqual({ home: 20, away: 22 });
  });

  it('survival page (ruled): the stake continues a provisional running total (R-34)', () => {
    const page = open(
      pageOf(runOf([1, 'A']), [row(1, 'A', 10, true)], ruledRules),
    );
    expect(page.stake).toEqual({ home: 20, away: 22 });
  });
});
