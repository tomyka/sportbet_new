import { describe, expect, it } from 'vitest';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import { Season } from '../round/season';
import { ruledRules } from '../rules/rule-set';
import { leagueTableRows } from '../dashboard/league-table-rows';
import type { PlayerId, RoundNumber } from '../shared/ids';
import {
  at,
  gameNo,
  leagueRow,
  makeGame,
  makeRound,
  matchRow,
  player,
  roundNo,
  unwrap,
  type GameSpec,
} from '../testing';
import {
  resultsSummary,
  type StartedPrediction,
  type ResultsSummary,
} from './results-summary';

const ada = player('ada');
const ben = player('ben');
const ceda = player('ceda');
const table = [
  leagueRow(ada, 'ada'),
  leagueRow(ben, 'ben'),
  leagueRow(ceda, 'ceda'),
];
const names = new Map<RoundNumber, string>([
  [roundNo(1), 'E1'],
  [roundNo(2), 'E2'],
  [roundNo(3), 'E3'],
  [roundNo(4), 'E4'],
]);

const game = (spec: Omit<GameSpec, 'home' | 'away'>) =>
  makeGame({ home: 'ZAL', away: 'OLY', ...spec });
const seasonOf = (games: readonly ReturnType<typeof game>[]) =>
  unwrap(
    Season.create({
      rounds: [
        makeRound({ number: 1 }),
        makeRound({ number: 2, knockout: true }),
        makeRound({ number: 3 }),
        makeRound({ number: 4 }),
      ],
      games,
      endsAt: null,
    }),
  );
const pick = (
  who: PlayerId,
  id: number,
  home: number | null,
  away: number | null,
): StartedPrediction => ({ player: who, game: gameNo(id), home, away });

const summarise = (
  season: Season,
  now: string,
  extra: Partial<Parameters<typeof resultsSummary>[0]> = {},
): ResultsSummary =>
  resultsSummary({
    season,
    now: at(now),
    table,
    rows: { matches: [] },
    predictions: [],
    roundNames: names,
    current: null,
    ...extra,
  });

const ids = (summary: ResultsSummary) =>
  summary.rounds.map((round) => Number(round.round));

describe('resultsSummary: which games are shown (R-86)', () => {
  const open = game({ id: 1, round: 1, tipOff: '2026-10-10T18:00:00Z' });

  it('never shows an open game, even with predictions passed in', () => {
    const summary = summarise(seasonOf([open]), '2026-10-06T12:00:00Z', {
      predictions: [pick(ada, 1, 85, 80)],
    });
    expect(summary.rounds).toEqual([]);
  });

  it('shows a game at its tip-off instant, and not a second before', () => {
    const season = seasonOf([open]);
    expect(
      summarise(season, '2026-10-10T18:00:00Z').rounds[0]?.games,
    ).toHaveLength(1);
    expect(summarise(season, '2026-10-10T17:59:59Z').rounds).toEqual([]);
  });

  it('keeps back a postponed game that has not tipped off, whose new date reopens it (R-41)', () => {
    const postponed = unwrap(
      open.postpone(at('2026-10-06T12:00:00Z'), ruledRules),
    );
    expect(
      summarise(seasonOf([postponed]), '2026-10-06T12:00:00Z').rounds,
    ).toEqual([]);
  });

  it('another tournament`s game in the predictions is an impossible state', () => {
    expect(() =>
      summarise(
        seasonOf([game({ id: 1, round: 1, tipOff: '2026-10-01T18:00:00Z' })]),
        '2026-10-06T12:00:00Z',
        { predictions: [pick(ada, 99, 85, 80)] },
      ),
    ).toThrow('not in the season');
  });
});

describe('resultsSummary: rounds and games', () => {
  const season = seasonOf([
    game({
      id: 1,
      round: 1,
      tipOff: '2026-10-01T18:00:00Z',
      result: [88, 79],
    }),
    game({
      id: 2,
      round: 1,
      tipOff: '2026-10-01T20:00:00Z',
      result: [70, 95],
    }),
    game({
      id: 3,
      round: 2,
      tipOff: '2026-10-05T18:00:00Z',
      result: [90, 85],
    }),
    game({ id: 4, round: 2, tipOff: '2026-10-05T20:00:00Z' }),
    game({ id: 5, round: 3, tipOff: '2026-10-10T18:00:00Z' }),
    game({
      id: 6,
      round: 4,
      tipOff: '2026-10-03T18:00:00Z',
      result: [80, 70],
    }),
  ]);
  const now = '2026-10-06T12:00:00Z';

  it('lists rounds with a started unscored game first, then finished rounds most recent first', () => {
    expect(ids(summarise(season, now))).toEqual([2, 4, 1]);
  });

  it('unfolds only rounds with an unscored game and the current round', () => {
    const open = (current: RoundNumber | null) =>
      summarise(season, now, { current }).rounds.map(({ open }) => open);
    expect(open(null)).toEqual([true, false, false]);
    expect(open(roundNo(1))).toEqual([true, false, true]);
  });

  it('names each round and lists its games by id', () => {
    const round = summarise(season, now).rounds[2];
    expect(round?.name).toBe('E1');
    expect(round?.games.map(({ game }) => game)).toEqual([
      gameNo(1),
      gameNo(2),
    ]);
  });

  it('shows "-" and pending for a started game with no result yet', () => {
    const started = summarise(season, now, {
      predictions: [pick(ada, 4, 85, 80)],
    }).rounds[0]?.games[1];
    expect(started?.result).toBeNull();
    expect(started?.cells.get(ada)).toEqual({
      score: { home: 85, away: 80 },
      verdict: 'pending',
      points: null,
    });
  });

  it('puts the columns in the league table order, a tie in Lithuanian order (R-30, R-102)', () => {
    const total = (who: PlayerId) => ({
      player: who,
      match: Points.ZERO,
      serija: Points.ZERO,
      standings: StandingsPoints.ZERO,
      survival: Points.ZERO,
    });
    const tied = leagueTableRows({
      season,
      rows: { matches: [], standings: [], survival: [] },
      totals: [total(ada), total(ben), total(ceda)],
      listed: new Set([ada, ben, ceda]),
      usernames: new Map([
        [ada, 'Zita'],
        [ben, 'Čeda'],
        [ceda, 'Ada'],
      ]),
      rules: ruledRules,
    });
    expect(
      summarise(season, now, { table: tied }).columns.map(
        ({ username }) => username,
      ),
    ).toEqual(['Ada', 'Čeda', 'Zita']);
  });

  it('shows a scored game`s result, points parts and verdict', () => {
    const summary = summarise(season, now, {
      rows: {
        matches: [
          matchRow(ada, 6, { winner: 7950, margin: 4600, serija: 1000 }),
        ],
      },
      predictions: [pick(ada, 6, 85, 80), pick(ben, 6, 70, 80)],
    });
    const scored = summary.rounds[1]?.games[0];
    expect(scored?.result).toEqual({ home: 80, away: 70 });
    expect(scored?.cells.get(ada)).toEqual({
      score: { home: 85, away: 80 },
      verdict: 'ok',
      points: {
        totalTenths: 1_355,
        winnerTenths: 795,
        marginTenths: 460,
        bingoTenths: 0,
        serijaTenths: 100,
      },
    });
    expect(scored?.cells.get(ben)?.verdict).toBe('fail');
    expect(scored?.cells.get(ben)?.points?.totalTenths).toBe(0);
  });

  it('has no cell for a player without a prediction row, and no badge for a blank row', () => {
    const summary = summarise(season, now, {
      predictions: [pick(ada, 6, null, null)],
    });
    const cells = summary.rounds[1]?.games[0]?.cells;
    expect(cells?.has(ben)).toBe(false);
    expect(cells?.get(ada)?.verdict).toBeNull();
    expect(cells?.get(ada)?.score).toBeNull();
  });

  it('judges a knockout round`s draw as a fail even when the winner is paid', () => {
    const cells = summarise(season, now, {
      rows: { matches: [matchRow(ada, 3, { winner: 7950 })] },
      predictions: [pick(ada, 3, 80, 80)],
    }).rounds[0]?.games[0]?.cells;
    expect(cells?.get(ada)?.verdict).toBe('fail');
  });

  it('sums match and serija in tenths per round and in "Viso", 0 for a player with no row', () => {
    const summary = summarise(season, now, {
      rows: {
        matches: [
          matchRow(ada, 1, { winner: 7950, serija: 1000 }),
          matchRow(ada, 6, { winner: 5000 }),
          matchRow(ben, 1, { margin: 3200 }),
        ],
      },
      predictions: [
        pick(ada, 1, 85, 80),
        pick(ben, 1, 79, 88),
        pick(ada, 6, 85, 80),
      ],
    });
    const byRound = (round: number, who: PlayerId) =>
      summary.rounds
        .find((each) => each.round === roundNo(round))
        ?.totalTenths.get(who);
    expect(byRound(1, ada)).toBe(895);
    expect(byRound(1, ben)).toBe(320);
    expect(byRound(4, ada)).toBe(500);
    expect(byRound(4, ben)).toBe(0);
    expect(summary.totalTenths.get(ada)).toBe(1_395);
    expect(summary.totalTenths.get(ben)).toBe(320);
    expect(summary.totalTenths.get(ceda)).toBe(0);
  });

  it('rounds the full points and the serija to one place before adding them, as the SQL does: 1.04 + 1.04 is 2.0', () => {
    const summary = summarise(season, now, {
      rows: { matches: [matchRow(ada, 1, { winner: 104, serija: 104 })] },
      predictions: [pick(ada, 1, 85, 80)],
    });
    const cell = summary.rounds[2]?.games[0]?.cells.get(ada);
    expect(cell?.points).toMatchObject({
      totalTenths: 20,
      winnerTenths: 10,
      serijaTenths: 10,
    });
    expect(summary.rounds[2]?.totalTenths.get(ada)).toBe(20);
    expect(summary.totalTenths.get(ada)).toBe(20);
  });

  it('adds the games rounded tenths in a round and in "Viso", not their hundredths', () => {
    const summary = summarise(season, now, {
      rows: {
        matches: [
          matchRow(ada, 1, { winner: 104 }),
          matchRow(ada, 2, { winner: 104 }),
          matchRow(ada, 6, { winner: 104 }),
        ],
      },
      predictions: [
        pick(ada, 1, 85, 80),
        pick(ada, 2, 85, 80),
        pick(ada, 6, 85, 80),
      ],
    });
    expect(summary.rounds[2]?.totalTenths.get(ada)).toBe(20);
    expect(summary.totalTenths.get(ada)).toBe(30);
  });

  it('a round without a name is an impossible state', () => {
    expect(() => summarise(season, now, { roundNames: new Map() })).toThrow(
      'without a name',
    );
  });
});
