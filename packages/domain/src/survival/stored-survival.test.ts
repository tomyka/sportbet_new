import { describe, expect, it } from 'vitest';
import { Points } from '../points/points';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import type { Game } from '../round/game';
import {
  makeGame,
  player,
  roundNo,
  team,
  tournamentKey,
  unwrap,
} from '../testing';
import { foldSurvival, survivalAtResultEntry } from './survival-fold';
import {
  refoldStoredSurvival,
  type StoredSurvivalRow,
} from './stored-survival';

// sportbet's SurvivalRunTest::folds (tests/Unit/Support/SurvivalRunTest.php
// at 0da316f), Euroleague only: the football cases (a flat 10 either way)
// have no counterpart, and the two-tournament cases run two Euroleague
// tournaments, so their away rows pay 12 where football's paid 10.
const row = (
  id: number,
  user: string,
  tournament: string,
  round: number,
  picked: string,
  awayTeam: string | null,
  stored: number,
): StoredSurvivalRow => ({
  id,
  player: player(user),
  tournament: tournamentKey(tournament),
  round: roundNo(round),
  team: team(picked),
  storedPoints: unwrap(Points.whole(stored)),
  awayTeam: awayTeam === null ? null : team(awayTeam),
});
const refolded = (rows: readonly StoredSurvivalRow[]) =>
  Object.fromEntries(
    unwrap(refoldStoredSurvival(rows, sportbetRules)).map(({ id, points }) => [
      id,
      points.toString(),
    ]),
  );

describe('SU-10: the full recalculation refolds the stored rows', () => {
  it.each([
    ['nothing stored', [], {}],
    [
      'away, home, away under the old flat rule repays 12, 22, 34',
      [
        row(1, 'ada', 'EL', 1, 'T7', 'T7', 10),
        row(2, 'ada', 'EL', 2, 'T5', 'T6', 20),
        row(3, 'ada', 'EL', 3, 'T8', 'T8', 30),
      ],
      { 1: '12.00', 2: '22.00', 3: '34.00' },
    ],
    [
      'a stored 0 is the loss: it stays 0 and the run restarts',
      [
        row(1, 'ada', 'EL', 1, 'T7', 'T7', 12),
        row(2, 'ada', 'EL', 2, 'T5', 'T5', 0),
        row(3, 'ada', 'EL', 3, 'T8', 'T8', 12),
      ],
      { 1: '12.00', 2: '0.00', 3: '12.00' },
    ],
    [
      'no game for the team in its round pays the home rate',
      [row(1, 'ada', 'EL', 1, 'T7', null, 10)],
      { 1: '10.00' },
    ],
    [
      'a row seen twice (the team played twice) is folded once, by its first game',
      [
        row(1, 'ada', 'EL', 1, 'T7', 'T7', 10),
        row(1, 'ada', 'EL', 1, 'T7', 'T9', 10),
        row(2, 'ada', 'EL', 2, 'T5', 'T6', 20),
      ],
      { 1: '12.00', 2: '22.00' },
    ],
    [
      'two players run separately',
      [
        row(1, 'ada', 'EL', 1, 'T7', 'T7', 12),
        row(2, 'ada', 'EL', 2, 'T5', 'T6', 22),
        row(3, 'ben', 'EL', 2, 'T5', 'T6', 99),
      ],
      { 1: '12.00', 2: '22.00', 3: '10.00' },
    ],
    [
      'two tournaments run separately (#217)',
      [
        row(1, 'ada', 'EL1', 1, 'T7', 'T8', 10),
        row(2, 'ada', 'EL2', 1, 'T5', 'T5', 22),
        row(3, 'ada', 'EL1', 2, 'T6', 'T6', 32),
        row(4, 'ada', 'EL2', 2, 'T3', 'T4', 42),
      ],
      { 1: '10.00', 2: '12.00', 3: '22.00', 4: '22.00' },
    ],
    [
      "a stored loss ends its own tournament's run and no other (#217)",
      [
        row(1, 'ada', 'EL1', 1, 'T7', 'T7', 0),
        row(2, 'ada', 'EL2', 1, 'T5', 'T5', 12),
        row(3, 'ada', 'EL1', 2, 'T6', 'T6', 22),
        row(4, 'ada', 'EL2', 2, 'T3', 'T4', 32),
      ],
      { 1: '0.00', 2: '12.00', 3: '12.00', 4: '22.00' },
    ],
  ] as const)('survival (sportbet): %s', (_, rows, expected) => {
    expect(refolded(rows)).toEqual(expected);
  });

  it('survival (sportbet): rows are folded in round order, whatever order they come in', () => {
    expect(
      refolded([
        row(3, 'ada', 'EL', 3, 'T8', 'T8', 30),
        row(1, 'ada', 'EL', 1, 'T7', 'T7', 10),
        row(2, 'ada', 'EL', 2, 'T5', 'T6', 20),
      ]),
    ).toEqual({ 1: '12.00', 2: '22.00', 3: '34.00' });
  });

  it('survival (sportbet): one id in two rounds is refused', () => {
    expect(
      refoldStoredSurvival(
        [
          row(1, 'ada', 'EL', 1, 'T7', 'T7', 10),
          row(1, 'ada', 'EL', 2, 'T7', 'T7', 10),
        ],
        sportbetRules,
      ),
    ).toEqual({ ok: false, refusal: 'one-id-two-rows' });
  });

  it('survival (ruled): scored from the pick history, so refolding stored rows is a programmer error (R-5)', () => {
    expect(() =>
      refoldStoredSurvival(
        [row(1, 'ada', 'EL', 1, 'T7', 'T7', 10)],
        ruledRules,
      ),
    ).toThrow(/pick history/);
  });
});

/** Round n's game, tipping off on day n. */
const game = (
  id: number,
  round: number,
  home: string,
  away: string,
  result: readonly [number, number],
): Game =>
  makeGame({
    id,
    round,
    home,
    away,
    tipOff: new Date(Date.UTC(2026, 9, round, 18))
      .toISOString()
      .replace('.000', ''),
    result,
  });

/** The rows sportbet stored at each result entry, read back as stored. */
const storedAtEntry = (
  picks: readonly { readonly round: number; readonly team: string }[],
  games: readonly Game[],
): StoredSurvivalRow[] =>
  survivalAtResultEntry(
    picks.map((each) => ({
      round: roundNo(each.round),
      team: team(each.team),
    })),
    games,
  ).flatMap((each, index) => {
    const away =
      games.find((g) => g.round === each.round && g.plays(each.team))?.away ??
      null;
    return each.points === null
      ? []
      : [
          {
            id: index + 1,
            player: player('asta'),
            tournament: tournamentKey('EL'),
            round: each.round,
            team: each.team,
            storedPoints: each.points,
            awayTeam: away,
          },
        ];
  });

describe('SU-9 and SU-10 under the sportbet set', () => {
  it('survival (sportbet): a stored 0 from a mistaken result is permanent', () => {
    // Round 1: Fenerbahce away (12). Round 2: Virtus away at Monaco; the
    // admin types 80-78 (a Monaco win), and Asta stores 0. The result is
    // corrected to 78-80, but the refold never reads results: the 0 stays.
    const picks = [
      { round: 1, team: 'FEN' },
      { round: 2, team: 'VIR' },
    ];
    const round1 = game(1, 1, 'REA', 'FEN', [70, 95]);
    const mistaken = [round1, game(2, 2, 'MON', 'VIR', [80, 78])];
    const corrected = [round1, game(2, 2, 'MON', 'VIR', [78, 80])];
    const rows = storedAtEntry(picks, mistaken);
    expect(refolded(rows)).toEqual({ 1: '12.00', 2: '0.00' });
    // A replay of the picks against the corrected result would restore it.
    expect(
      foldSurvival(
        picks.map((each) => ({
          round: roundNo(each.round),
          team: team(each.team),
        })),
        corrected,
      ).map((each) => each.points?.toString()),
    ).toEqual(['12.00', '24.00']);
  });

  it('survival (sportbet): a re-pick is rebuilt from the stored team of each round', () => {
    // SU-5's case: home wins in rounds 1-4, round 1 on T1, and T1 again in
    // round 5, away at T5. At result entry round 5 stores 42 (T1's round-1
    // pick moved to round 5); the refold reads round 1's stored team_id,
    // T1, and repays it: 52, which the pick history's fold also gives.
    const picks = [1, 2, 3, 4].map((round) => ({
      round,
      team: `T${String(round)}`,
    }));
    picks.push({ round: 5, team: 'T1' });
    const games = [
      ...[1, 2, 3, 4].map((round) =>
        game(
          round,
          round,
          `T${String(round)}`,
          `T${String(round + 1)}`,
          [90, 80],
        ),
      ),
      game(5, 5, 'T5', 'T1', [80, 90]),
    ];
    const rows = storedAtEntry(picks, games);
    expect(rows.map((each) => each.storedPoints.toString())).toEqual([
      '10.00',
      '20.00',
      '30.00',
      '40.00',
      '42.00',
    ]);
    expect(refolded(rows)).toEqual({
      1: '10.00',
      2: '20.00',
      3: '30.00',
      4: '40.00',
      5: '52.00',
    });
    expect(
      foldSurvival(
        picks.map((each) => ({
          round: roundNo(each.round),
          team: team(each.team),
        })),
        games,
      ).map((each) => each.points?.toString()),
    ).toEqual(['10.00', '20.00', '30.00', '40.00', '52.00']);
  });

  it('survival (sportbet): the golden rows refold to themselves', () => {
    expect(
      refolded([
        row(1, 'ada', 'EL', 1, 'FEN', 'FEN', 12),
        row(2, 'ada', 'EL', 2, 'ZAL', 'FEN', 22),
        row(3, 'ben', 'EL', 1, 'FEN', 'FEN', 12),
      ]),
    ).toEqual({ 1: '12.00', 2: '22.00', 3: '12.00' });
  });
});
