import { describe, expect, it } from 'vitest';
import { goldenInputs } from '../golden/golden-inputs';
import { GOLDEN, NAME_IDS } from '../golden/golden-scenario';
import { pointsOfHundredths, Points } from '../points/points';
import { oddsOfHundredths } from '../points/odds';
import { standingsPointsOfTenThousandths } from '../points/standings-points';
import { recalculateTournament } from '../recalculation/recalculation';
import type { StoredMatchRow } from '../recalculation/recalculation';
import { Season } from '../round/season';
import { ruledRules } from '../rules/rule-set';
import type { GameId, PlayerId } from '../shared/ids';
import { gameNo, makeGame, makeRound, player, unwrap } from '../testing';
import { earnedPointsOf } from './earned-points';
import { leagueHistory, rankChange } from './league-history';

const ada = NAME_IDS.player('ada');
const ben = NAME_IDS.player('ben');
const cai = NAME_IDS.player('cai');
const dan = NAME_IDS.player('dan');
const h1 = NAME_IDS.game(1);
const h2 = NAME_IDS.game(2);
const h3 = NAME_IDS.game(3);
const everyone = new Set(GOLDEN.players.map((name) => NAME_IDS.player(name)));

function goldenHistory(listed: ReadonlySet<PlayerId>) {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs, ruledRules));
  return leagueHistory({
    season: inputs.season,
    earned: earnedPointsOf(inputs.season, points),
    listed,
  });
}

const view = (
  history: ReturnType<typeof goldenHistory>,
  who: PlayerId,
): readonly (readonly [GameId, number, number, number])[] =>
  (history.get(who) ?? []).map((entry) => [
    entry.game,
    entry.totalCents,
    entry.gainedCents,
    entry.rank,
  ]);

describe('leagueHistory (getAllUsersGameHistory, getRankHistory)', () => {
  it('each counts from the game it was earned at (R-17, R-72)', () => {
    const history = goldenHistory(everyone);
    // R-138, hand-derived: ada's match rows 121.5, -140, 229.5; survival 24 at
    // h2 (FEN's game in E1), 44 at h3; standings 940 at h3 (the season has no
    // round 38: its last game).
    expect(view(history, ada)).toEqual([
      [h1, 12_150, 12_150, 2],
      [h2, 550, -11_600, 4],
      [h3, 121_900, 121_350, 1],
    ]);
    expect(view(history, ben)).toEqual([
      [h1, 1_400, 1_400, 3],
      [h2, 13_750, 12_350, 2],
      [h3, 94_750, 81_000, 2],
    ]);
    expect(view(history, cai)).toEqual([
      [h1, 12_750, 12_750, 1],
      [h2, 24_200, 11_450, 1],
      [h3, 41_150, 16_950, 3],
    ]);
    expect(view(history, dan)).toEqual([
      [h1, 0, 0, 4],
      [h2, 2_400, 2_400, 3],
      [h3, 6_800, 4_400, 4],
    ]);
  });

  it('"+ Tšk" adds up to the total exactly', () => {
    for (const entries of goldenHistory(everyone).values()) {
      expect(
        entries.reduce((sum, { gainedCents }) => sum + gainedCents, 0),
      ).toBe(entries.at(-1)?.totalCents);
    }
  });

  it('a player not listed has no history and takes no rank', () => {
    const history = goldenHistory(new Set([ben, cai, dan]));
    expect(history.has(ada)).toBe(false);
    // From the totals above: cai leads after h1 and h2, ben after h3.
    expect(view(history, ben).map(([, , , rank]) => rank)).toEqual([2, 2, 1]);
    expect(view(history, dan).map(([, , , rank]) => rank)).toEqual([3, 3, 3]);
  });

  it('players equal on the total and on match points share a rank (1, 2, 2, 4)', () => {
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
            result: [80, 75],
          }),
        ],
        endsAt: null,
      }),
    );
    const row = (
      who: PlayerId,
      full: number,
      serija: number,
    ): StoredMatchRow => ({
      player: who,
      game: gameNo(1),
      points: {
        winner: Points.ZERO,
        margin: Points.ZERO,
        bingo: Points.ZERO,
        full: pointsOfHundredths(full),
        odds: oddsOfHundredths(0),
      },
      serija: pointsOfHundredths(serija),
    });
    const [p1, p2, p3, p4] = ['1', '2', '3', '4'].map(player);
    if (
      p1 === undefined ||
      p2 === undefined ||
      p3 === undefined ||
      p4 === undefined
    ) {
      throw new Error('four players');
    }
    const history = leagueHistory({
      season,
      earned: earnedPointsOf(season, {
        matches: [
          row(p1, 9_000, 0),
          row(p2, 5_000, 0),
          row(p3, 5_000, 0),
          // Equal total, fewer match points: ranked after.
          row(p4, 4_000, 1_000),
        ],
        standings: [],
        survival: [],
      }),
      listed: new Set([p1, p2, p3, p4]),
    });
    expect([p1, p2, p3, p4].map((who) => history.get(who)?.[0]?.rank)).toEqual([
      1, 2, 2, 4,
    ]);
  });

  it('a game without a result is not an entry', () => {
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 2,
            round: 1,
            home: 'REA',
            away: 'FEN',
            tipOff: '2026-10-02T18:00:00Z',
          }),
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
            result: [80, 75],
          }),
        ],
        endsAt: null,
      }),
    );
    const p1 = player('1');
    const history = leagueHistory({
      season,
      earned: [],
      listed: new Set([p1]),
    });
    expect(history.get(p1)).toEqual([
      { game: gameNo(1), totalCents: 0, gainedCents: 0, rank: 1 },
    ]);
  });
});

describe('leagueHistory: points counted from a game not yet scored', () => {
  it('count from the latest scored game', () => {
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
            result: [80, 75],
          }),
          makeGame({
            id: 2,
            round: 1,
            home: 'REA',
            away: 'FEN',
            tipOff: '2026-10-02T18:00:00Z',
          }),
        ],
        endsAt: null,
      }),
    );
    const p1 = player('1');
    const history = leagueHistory({
      season,
      earned: [
        {
          player: p1,
          kind: 'standings',
          points: standingsPointsOfTenThousandths(600_000),
          atGame: gameNo(2),
        },
      ],
      listed: new Set([p1]),
    });
    expect(history.get(p1)?.map(({ totalCents }) => totalCents)).toEqual([
      6_000,
    ]);
  });
});

describe('rankChange (Ranking::change)', () => {
  it('is the rank five entries back minus the rank now', () => {
    expect(rankChange([5, 4, 4, 3, 2, 2, 1], 1)).toBe(3);
  });

  it('takes the first entry when there are fewer than six', () => {
    expect(rankChange([4, 2, 1], 1)).toBe(3);
  });

  it('is null under two entries', () => {
    expect(rankChange([3], 3)).toBeNull();
    expect(rankChange([], 1)).toBeNull();
  });
});
