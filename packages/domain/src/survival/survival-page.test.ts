import { describe, expect, it } from 'vitest';
import { Points, pointsWhole } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { Game } from '../round/game';
import type { Round } from '../round/round';
import { Season } from '../round/season';
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
  extra?: Partial<Parameters<typeof survivalPickPage>[0]>,
) =>
  survivalPickPage({
    season,
    teams,
    survivalPlayed: true,
    run,
    rows,
    now: MONDAY,
    ...extra,
  });
const cardsOf = (page: SurvivalPickPage) =>
  open(page).cards.map(
    (card) =>
      `${card.team}:${card.state.kind}${card.state.kind === 'used' ? String(card.state.round) : ''}:${card.selectable ? 'pick' : 'no'}${card.picked ? ':picked' : ''}`,
  );

describe('survivalPickPage', () => {
  it('survival page: one card per team playing in the round, by team id, each with its state', () => {
    const page = pageOf(runOf([1, 'A']), [row(1, 'A', 10)]);
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

  it(`survival page: each card's opponent and ground`, () => {
    const cards = open(pageOf(SurvivalRun.EMPTY, [])).cards;
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

  it('survival page: selectable equals withPick for every card (sportbet issue 292)', () => {
    const fixtures: readonly [SurvivalRun, readonly SurvivalPoints[]][] = [
      [SurvivalRun.EMPTY, []],
      [runOf([1, 'A']), [row(1, 'A', 10)]],
      [runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)]],
      [runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10)]],
      [runOf([1, 'B']), [row(1, 'B', 0)]],
    ];
    for (const [run, rows] of fixtures) {
      for (const card of open(pageOf(run, rows)).cards) {
        const accepted = run.withPick(card.team, {
          season,
          teams,
          survivalPlayed: true,
          now: MONDAY,
        }).ok;
        expect([card.team, card.selectable]).toEqual([card.team, accepted]);
      }
    }
  });

  it(`survival page: every card, the lock and the notice come from withPick's refusals`, () => {
    const fixtures: readonly [SurvivalRun, readonly SurvivalPoints[]][] = [
      [SurvivalRun.EMPTY, []],
      [runOf([1, 'A']), [row(1, 'A', 10)]],
      [runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)]],
      [runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10)]],
      [runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10), row(2, 'D', 20)]],
      [runOf([1, 'B']), [row(1, 'B', 0)]],
    ];
    const ctx = { season, teams, survivalPlayed: true, now: MONDAY };
    for (const [run, rows] of fixtures) {
      const page = open(pageOf(run, rows));
      const refusals = run.refusalsFor(
        page.cards.map((card) => card.team),
        ctx,
      );
      for (const card of page.cards) {
        const why = refusals.get(card.team) ?? [];
        expect([card.team, card.selectable]).toEqual([
          card.team,
          run.withPick(card.team, ctx).ok,
        ]);
        expect([card.team, card.state.kind]).toEqual([
          card.team,
          why.includes('team-used-in-run')
            ? 'used'
            : why.includes('team-already-started')
              ? 'started'
              : 'open',
        ]);
      }
      const locked = [...refusals.values()].some((why) =>
        why.includes('pick-locked'),
      );
      expect(page.pickLocked).toBe(locked);
      expect(page.lockNotice).toBe(locked && page.verdict === null);
    }
  });

  it('survival page: the lock notice is the lock while the round is unscored', () => {
    const locked = open(pageOf(runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10)]));
    expect(locked.lockNotice).toBe(true);
    const scored = open(
      pageOf(runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10), row(2, 'F', 20)]),
    );
    expect(scored.pickLocked).toBe(true);
    expect(scored.lockNotice).toBe(false);
    expect(open(pageOf(SurvivalRun.EMPTY, [])).lockNotice).toBe(false);
  });

  it('survival page: the held pick is marked and the round still open for a choice', () => {
    const page = open(pageOf(runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)]));
    expect(page.picked).toBe('D');
    expect(
      page.cards.filter((card) => card.picked).map((card) => card.team),
    ).toEqual(['D']);
    expect(page.choosing).toBe(true);
    expect(page.pickLocked).toBe(false);
    expect(page.verdict).toBeNull();
  });

  it('survival page: a pick whose game has tipped off locks every card (R-4)', () => {
    const page = open(pageOf(runOf([1, 'A'], [2, 'F']), [row(1, 'A', 10)]));
    expect(page.pickLocked).toBe(true);
    expect(page.cards.some((card) => card.selectable)).toBe(false);
    expect(page.choosing).toBe(false);
  });

  it('survival page: no pick, no lock', () => {
    const page = open(pageOf(SurvivalRun.EMPTY, []));
    expect(page.picked).toBeNull();
    expect(page.pickLocked).toBe(false);
  });

  it(`survival page: the round's verdict, survived and lost`, () => {
    const run = runOf([1, 'A'], [2, 'D']);
    expect(
      open(pageOf(run, [row(1, 'A', 10), row(2, 'D', 20)])).verdict,
    ).toEqual({
      state: 'survived',
      points: 20,
    });
    const lost = open(pageOf(run, [row(1, 'A', 10), row(2, 'D', 0)]));
    expect(lost.verdict).toEqual({ state: 'lost' });
    expect(lost.choosing).toBe(false);
  });

  it('survival page: the run before the round, its streak, its points and the stake', () => {
    const page = open(pageOf(runOf([1, 'A'], [2, 'D']), [row(1, 'A', 10)]));
    expect(
      page.run.map(
        (line) => `${String(line.round)}:${line.team}:${line.state}`,
      ),
    ).toEqual(['1:A:survived']);
    expect(page.streak).toBe(1);
    expect(page.runPoints).toBe(10);
    // R-138: a win pays 10 at home and 12 away, doubled.
    expect(page.stake).toEqual({ home: 30, away: 34 });
  });

  it('survival page: the page names what a win pays at home and away (R-138)', () => {
    const page = open(pageOf(runOf([1, 'A']), [row(1, 'A', 10)]));
    expect(page.pays).toEqual({ home: 20, away: 24 });
  });

  it('survival page: a loss empties the run and the stake starts over', () => {
    const page = open(pageOf(runOf([1, 'B']), [row(1, 'B', 0)]));
    expect(page.run).toEqual([]);
    expect(page.streak).toBe(0);
    expect(page.runPoints).toBe(0);
    expect(page.stake).toEqual({ home: 20, away: 24 });
    // The loss freed B.
    expect(cardsOf(page)).toContain('B:open:pick');
  });

  it('survival page: after every team is used, every card is open again (R-11)', () => {
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
      now: MONDAY,
    });
    expect(cardsOf(page)).toEqual(['A:open:pick', 'B:open:pick']);
    expect(open(page).free).toBe(2);
    expect(open(page).used).toBe(0);
  });

  it('survival page: over with no current round', () => {
    const empty = seasonOf([makeRound({ number: 1 })], []);
    expect(pageOf(SurvivalRun.EMPTY, [], { season: empty })).toEqual({
      kind: 'over',
    });
  });

  it('survival page: over in a round without survival', () => {
    const noSurvival = seasonOf(
      [makeRound({ number: 1 }), makeRound({ number: 2, survival: false })],
      [round1, ca],
    );
    expect(pageOf(SurvivalRun.EMPTY, [], { season: noSurvival })).toEqual({
      kind: 'over',
    });
  });

  it('survival page: over in a tournament without survival', () => {
    expect(pageOf(SurvivalRun.EMPTY, [], { survivalPlayed: false })).toEqual({
      kind: 'over',
    });
  });

  it('survival page (ruled): a pending earlier pick shows in the run but not in the streak (R-12)', () => {
    // Round 2's pick on E waits (D-E postponed); round 3 is current.
    const waiting = seasonOf(
      [1, 2, 3].map((number) => makeRound({ number })),
      [
        round1,
        unwrap(de.postpone(at('2026-10-14T12:00:00Z'))),
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
        now: at('2026-10-16T12:00:00Z'),
      }),
    );
    expect(page.round).toBe(3);
    expect(
      page.run.map((line) => `${String(line.round)}:${line.state}`),
    ).toEqual(['1:survived', '2:pending']);
    expect(page.streak).toBe(1);
    expect(page.runPoints).toBe(10);
    expect(page.stake).toEqual({ home: 30, away: 34 });
  });

  it('survival page: the page prints the run, verdict and stake as whole points, towards zero', () => {
    const half = (round: number, teamId: string, hundredths: number) => ({
      ...row(round, teamId, 0),
      points: unwrap(Points.ofHundredths(hundredths)),
    });
    const page = open(
      pageOf(runOf([1, 'A'], [2, 'D']), [
        half(1, 'A', 1250),
        half(2, 'D', 2299),
      ]),
    );
    expect(page.verdict).toEqual({ state: 'survived', points: 22 });
    const before = open(
      pageOf(runOf([1, 'A'], [2, 'D']), [half(1, 'A', 1250)]),
    );
    expect(before.run.map((leg) => leg.points)).toEqual([12]);
    expect(before.runPoints).toBe(12);
    expect(before.stake).toEqual({ home: 32, away: 36 });
  });

  it('survival page: the stake continues a provisional running total (R-34)', () => {
    const page = open(pageOf(runOf([1, 'A']), [row(1, 'A', 10, true)]));
    expect(page.stake).toEqual({ home: 30, away: 34 });
  });
});
