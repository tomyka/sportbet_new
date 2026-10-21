import { describe, expect, it } from 'vitest';
import { Points, pointsWhole } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import type { TournamentTotal } from '../recalculation/recalculation';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { Season } from '../round/season';
import type { PlayerId } from '../shared/ids';
import {
  at,
  makeGame,
  makeRound,
  player,
  rate,
  roundNo,
  score,
  team,
  unwrap,
} from '../testing';
import { SurvivalRun } from './survival-run';
import { survivalSummary, type SummaryRow } from './survival-summary';

const END = at('2027-05-31T00:00:00Z');
const ANA = player('1');
const BEN = player('2');
const runOf = (...picks: readonly [number, string][]) =>
  unwrap(
    SurvivalRun.stored(
      picks.map(([round, teamId]) => ({
        round: roundNo(round),
        team: team(teamId),
      })),
    ),
  );
const total = (who: PlayerId, survival: number): TournamentTotal => ({
  player: who,
  match: pointsWhole(0),
  serija: pointsWhole(0),
  standings: StandingsPoints.ZERO,
  survival: pointsWhole(survival),
});
const tiles = (summaryRow: SummaryRow | undefined) =>
  (summaryRow?.tiles ?? []).map(
    (tile) =>
      `${String(tile.round)}:${tile.state}:${tile.hidden ? 'hidden' : (tile.team ?? '-')}`,
  );

// Rounds 1-3: round 1 played (A beat B), round 2 current - C-D tips off
// Tuesday, E-F Thursday - and round 3 to come.
const round1 = makeGame({
  id: 1,
  round: 1,
  home: 'A',
  away: 'B',
  tipOff: '2026-10-06T18:00:00Z',
  result: [90, 80],
});
const cd = makeGame({
  id: 2,
  round: 2,
  home: 'C',
  away: 'D',
  tipOff: '2026-10-13T18:00:00Z',
});
const ef = makeGame({
  id: 3,
  round: 2,
  home: 'E',
  away: 'F',
  tipOff: '2026-10-15T18:00:00Z',
});
const round3 = makeGame({
  id: 4,
  round: 3,
  home: 'A',
  away: 'C',
  tipOff: '2026-10-20T18:00:00Z',
});
const seasonWith = (
  games: readonly Game[],
  rounds = [1, 2, 3].map((number) => makeRound({ number })),
) => unwrap(Season.create({ rounds, games, endsAt: END }));
const season = seasonWith([round1, cd, ef, round3]);
const MONDAY = at('2026-10-12T12:00:00Z');
const players = [
  { player: ANA, username: 'Ana', initials: 'AP' },
  { player: BEN, username: 'Ben', initials: 'BK' },
];
const summaryOf = (
  input: Partial<Parameters<typeof survivalSummary>[0]> = {},
) =>
  survivalSummary({
    season,
    now: MONDAY,
    survivalPlayed: true,
    viewer: ANA,
    players,
    runs: new Map(),
    totals: [],
    ...input,
  });
const rowOf = (summary: ReturnType<typeof survivalSummary>, who: PlayerId) =>
  summary.rows.find((line) => line.player === who);

describe('survivalSummary', () => {
  it('survival summary: the rounds up to the current one (R-84)', () => {
    expect(summaryOf().rounds).toEqual([1, 2]);
  });

  it('survival summary: every survival round when there is no current round (R-84)', () => {
    const empty = unwrap(
      Season.create({
        rounds: [1, 2].map((number) => makeRound({ number })),
        games: [],
        endsAt: END,
      }),
    );
    expect(summaryOf({ season: empty }).rounds).toEqual([1, 2]);
  });

  it('survival summary: a round without survival is not listed', () => {
    const noSurvival = seasonWith(
      [round1, cd, ef],
      [makeRound({ number: 1 }), makeRound({ number: 2, survival: false })],
    );
    expect(summaryOf({ season: noSurvival }).rounds).toEqual([1]);
  });

  it('survival summary: a pending pick is hidden from another player before its tip-off (R-82)', () => {
    const summary = summaryOf({
      viewer: ANA,
      runs: new Map([[BEN, runOf([1, 'A'], [2, 'E'])]]),
    });
    expect(tiles(rowOf(summary, BEN))).toEqual(['1:hit:A', '2:pending:hidden']);
  });

  it('survival summary: the viewer always sees their own pending pick (R-82)', () => {
    const summary = summaryOf({
      viewer: BEN,
      runs: new Map([[BEN, runOf([2, 'E'])]]),
    });
    expect(tiles(rowOf(summary, BEN))).toEqual(['1:none:-', '2:pending:E']);
  });

  it('survival summary: a pending pick shows once its game tips off (R-82)', () => {
    const summary = summaryOf({
      now: at('2026-10-13T18:00:00Z'),
      runs: new Map([[BEN, runOf([2, 'C'])]]),
    });
    expect(tiles(rowOf(summary, BEN))).toEqual(['1:none:-', '2:pending:C']);
  });

  it('survival summary: a pending pick shows once its game has a result (R-82)', () => {
    // E-F ended level, as sportbet stored it until sportbet#274: a result
    // that decides nothing, so the pick stays pending.
    const level = unwrap(
      Game.stored({
        id: ef.id,
        round: ef.round,
        home: ef.home,
        away: ef.away,
        tipOff: ef.tipOff,
        result: score(80, 80),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    );
    const played = unwrap(season.withGame(level));
    const summary = summaryOf({
      season: played,
      runs: new Map([[BEN, runOf([2, 'E'])]]),
    });
    expect(tiles(rowOf(summary, BEN))).toEqual(['1:none:-', '2:pending:E']);
  });

  it('survival summary: a pick on a game postponed before its tip-off stays hidden (R-101)', () => {
    const postponed = unwrap(
      season.withGame(unwrap(ef.postpone(at('2026-10-14T12:00:00Z')))),
    );
    const summary = summaryOf({
      season: postponed,
      now: at('2026-10-16T12:00:00Z'),
      runs: new Map([[BEN, runOf([2, 'E'])]]),
    });
    expect(tiles(rowOf(summary, BEN))[1]).toBe('2:pending:hidden');
  });

  it('survival summary: a listed player without picks has a row of none tiles and a zero total', () => {
    const summary = summaryOf();
    expect(tiles(rowOf(summary, BEN))).toEqual(['1:none:-', '2:none:-']);
    expect(rowOf(summary, BEN)?.total).toBe(0);
    expect(rowOf(summary, BEN)?.streak).toBe(0);
  });

  it(`survival summary: the total is the stored total, the initials and the viewer's row`, () => {
    const summary = summaryOf({ totals: [total(ANA, 22)] });
    const ana = rowOf(summary, ANA);
    expect(ana?.total).toBe(22);
    expect(ana?.initials).toBe('AP');
    expect(ana?.me).toBe(true);
    expect(rowOf(summary, BEN)?.me).toBe(false);
  });

  it('survival summary: a tournament that plays no survival has no survival rounds', () => {
    expect(summaryOf({ survivalPlayed: false }).rounds).toEqual([]);
  });

  it('survival summary: tile points are the derived running total, and the total prints whole, towards zero', () => {
    const summary = summaryOf({
      runs: new Map([[ANA, runOf([1, 'A'])]]),
      totals: [
        {
          ...total(ANA, 0),
          survival: unwrap(Points.ofHundredths(-50)),
        },
      ],
    });
    // A home win pays 10, doubled (R-138).
    expect(rowOf(summary, ANA)?.tiles[0]?.points).toBe(20);
    expect(rowOf(summary, ANA)?.total).toBe(0);
  });

  it('survival summary: ordered by the exact total, not the whole part', () => {
    const summary = summaryOf({
      totals: [
        { ...total(ANA, 0), survival: unwrap(Points.ofHundredths(1210)) },
        { ...total(BEN, 0), survival: unwrap(Points.ofHundredths(1290)) },
      ],
    });
    expect(summary.rows.map((line) => line.player)).toEqual([BEN, ANA]);
  });

  it('survival summary: "~" only with a provisional total in the rounds shown (R-83)', () => {
    // Round 1 (A-B) is postponed and round 2 (C-D) was won by C: Ana's
    // round-2 total stands behind her pending round-1 pick, Ben's does not.
    const waiting = unwrap(
      season.withGame(
        unwrap(
          Game.stored({
            id: round1.id,
            round: round1.round,
            home: round1.home,
            away: round1.away,
            tipOff: round1.tipOff,
            result: null,
            recordedWinner: null,
            lockedSince: null,
            postponed: true,
          }),
        ),
      ),
    );
    const decided = unwrap(
      waiting.withGame(unwrap(cd.withResult(score(90, 80)))),
    );
    const summary = summaryOf({
      season: decided,
      runs: new Map([
        [ANA, runOf([1, 'A'], [2, 'C'])],
        [BEN, runOf([2, 'C'])],
      ]),
    });
    expect(rowOf(summary, ANA)?.provisional).toBe(true);
    expect(rowOf(summary, BEN)?.provisional).toBe(false);
  });

  it('survival summary: the trailing run skips pending and empty rounds, and a miss stops it', () => {
    const five = seasonWith(
      [1, 2, 3, 4, 5].map((number) =>
        makeGame({
          id: number,
          round: number,
          home: 'A',
          away: 'B',
          tipOff: `2026-10-0${String(number)}T18:00:00Z`,
          ...(number < 5 ? { result: [90, 80] as const } : {}),
        }),
      ),
      [1, 2, 3, 4, 5].map((number) => makeRound({ number })),
    );
    // Round 1 lost, 2 survived, 3 skipped, 4 survived, 5 pending.
    const summary = summaryOf({
      season: five,
      now: at('2026-10-05T12:00:00Z'),
      viewer: ANA,
      runs: new Map([[ANA, runOf([1, 'B'], [2, 'A'], [4, 'A'], [5, 'A'])]]),
    });
    expect(tiles(rowOf(summary, ANA))).toEqual([
      '1:miss:B',
      '2:hit:A',
      '3:none:-',
      '4:hit:A',
      '5:pending:A',
    ]);
    expect(rowOf(summary, ANA)?.streak).toBe(2);
  });

  it('survival summary: ordered by total, then the trailing run', () => {
    const cy = player('3');
    const summary = summaryOf({
      players: [...players, { player: cy, username: 'Cy', initials: 'C' }],
      runs: new Map([[BEN, runOf([1, 'A'])]]),
      totals: [total(ANA, 10), total(BEN, 10), total(cy, 12)],
    });
    expect(
      summary.rows.map((line) => `${String(line.rank)}:${line.username}`),
    ).toEqual(['1:Cy', '2:Ben', '3:Ana']);
  });
  it('survival summary (ruled): ties by name with Š after S (R-30)', () => {
    const named = ['šarūnas', 'Saulius', 'Tomas'].map((username, index) => ({
      player: player(String(index + 1)),
      username,
      initials: 'X',
    }));
    expect(
      summaryOf({ players: named }).rows.map((line) => line.username),
    ).toEqual(['Saulius', 'šarūnas', 'Tomas']);
  });

  it('survival summary (ruled): no playoff round, even stored with the flag (SU-7, R-10)', () => {
    const playoff = Round.stored({
      number: roundNo(39),
      stage: 'play-offs',
      rate: rate(1),
      survival: true,
      knockout: false,
    });
    const withPlayoff = seasonWith(
      [
        round1,
        makeGame({
          id: 39,
          round: 39,
          home: 'A',
          away: 'B',
          tipOff: '2027-04-20T18:00:00Z',
        }),
      ],
      [makeRound({ number: 1 }), playoff],
    );
    const later = at('2027-04-19T12:00:00Z');
    expect(summaryOf({ season: withPlayoff, now: later }).rounds).toEqual([1]);
  });
});
