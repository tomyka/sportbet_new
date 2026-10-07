import { describe, expect, it } from 'vitest';
import { GOLDEN, goldenInputs, NAME_IDS } from '../golden/golden-scenario';
import { pointsOfHundredths, Points } from '../points/points';
import { oddsOfHundredths } from '../points/odds';
import { standingsPointsOfTenThousandths } from '../points/standings-points';
import { recalculateTournament } from '../recalculation/recalculation';
import type { StoredMatchRow } from '../recalculation/recalculation';
import { Season } from '../round/season';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
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

function goldenHistory(rules: RuleSet, listed: ReadonlySet<PlayerId>) {
  const inputs = goldenInputs();
  const points = unwrap(recalculateTournament(inputs, rules));
  return leagueHistory({
    season: inputs.season,
    earned: earnedPointsOf(inputs.season, points),
    listed,
    rules,
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
  it('under sportbetRules standings and survival count from the first game', () => {
    const history = goldenHistory(sportbetRules, everyone);
    // ada: 1640 standings + 34 survival from h1; match + serija 125.5, -45,
    // 179.5. "+ Tšk" is the change in the total, so h1 carries the spread.
    expect(view(history, ada)).toEqual([
      [h1, 179_950, 179_950, 1],
      [h2, 175_450, -4_500, 1],
      [h3, 193_400, 17_950, 1],
    ]);
    expect(view(history, ben)).toEqual([
      [h1, 82_400, 82_400, 2],
      [h2, 93_850, 11_450, 2],
      [h3, 97_850, 4_000, 2],
    ]);
    expect(view(history, cai)).toEqual([
      [h1, 12_850, 12_850, 3],
      [h2, 25_800, 12_950, 3],
      [h3, 42_750, 16_950, 3],
    ]);
    // dan has only survival points: an entry at every game all the same.
    expect(view(history, dan)).toEqual([
      [h1, 3_400, 3_400, 4],
      [h2, 3_400, 0, 4],
      [h3, 3_400, 0, 4],
    ]);
  });

  it('under ruledRules each counts from the game it was earned at (R-17, R-72)', () => {
    const history = goldenHistory(ruledRules, everyone);
    // ada: survival 12 at h2 (FEN's game in E1), 22 at h3; standings 940
    // at h3 (the season has no round 38: its last game).
    expect(view(history, ada)).toEqual([
      [h1, 12_550, 12_550, 2],
      [h2, 9_250, -3_300, 3],
      [h3, 123_400, 114_150, 1],
    ]);
    expect(view(history, ben)).toEqual([
      [h1, 3_200, 3_200, 3],
      [h2, 15_850, 12_650, 2],
      [h3, 97_850, 82_000, 2],
    ]);
    expect(view(history, cai)).toEqual([
      [h1, 12_850, 12_850, 1],
      [h2, 25_800, 12_950, 1],
      [h3, 42_750, 16_950, 3],
    ]);
    expect(view(history, dan)).toEqual([
      [h1, 0, 0, 4],
      [h2, 1_200, 1_200, 4],
      [h3, 3_400, 2_200, 4],
    ]);
  });

  it('"+ Tšk" adds up to the total exactly, under both sets', () => {
    for (const rules of [sportbetRules, ruledRules]) {
      for (const entries of goldenHistory(rules, everyone).values()) {
        expect(
          entries.reduce((sum, { gainedCents }) => sum + gainedCents, 0),
        ).toBe(entries.at(-1)?.totalCents);
      }
    }
  });

  it('a player not listed has no history and takes no rank', () => {
    const history = goldenHistory(sportbetRules, new Set([ben, cai, dan]));
    expect(history.has(ada)).toBe(false);
    expect(view(history, ben).map(([, , , rank]) => rank)).toEqual([1, 1, 1]);
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
      rules: sportbetRules,
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
      rules: sportbetRules,
    });
    expect(history.get(p1)).toEqual([
      { game: gameNo(1), totalCents: 0, gainedCents: 0, rank: 1 },
    ]);
  });
});

describe('leagueHistory: points counted from a game not yet scored', () => {
  it('count from the latest scored game, under both sets', () => {
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
    for (const rules of [sportbetRules, ruledRules]) {
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
        rules,
      });
      expect(history.get(p1)?.map(({ totalCents }) => totalCents)).toEqual([
        6_000,
      ]);
    }
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
