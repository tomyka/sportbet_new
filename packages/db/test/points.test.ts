import {
  CrowdOdds,
  Game,
  Odds,
  Points,
  StandingsOdds,
  StandingsPoints,
  type PointsRows,
  type StoredMatchRow,
  type SurvivalPoints,
} from '@sportbet/domain';
import { at, gameNo, roundNo, score, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadGameOdds,
  loadTournamentInputs,
  loadTournamentPoints,
  loadTournamentTotals,
} from '../src';
import { saveTournamentPoints } from '../src/points/repository';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { countRetiredRows, seedRetiredRows } from './retired-rows';
import {
  ADA,
  BEN,
  FEN,
  OLY,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

beforeEach(async () => {
  await saveWorld(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await saveGames(db, TOURNAMENT, [
    unwrap(
      Game.stored({
        id: gameNo(7),
        round: roundNo(1),
        home: ZAL,
        away: OLY,
        tipOff: at('2026-10-02T18:00:00Z'),
        result: score(70, 95),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  ]);
});

const hundredths = (value: number) => unwrap(Points.ofHundredths(value));
const odds = (value: number) => unwrap(Odds.ofHundredths(value));
const tenThousandths = (value: number) =>
  unwrap(StandingsPoints.ofTenThousandths(value));

const MATCH: StoredMatchRow = {
  player: ADA,
  game: gameNo(7),
  points: {
    winner: Points.ZERO,
    margin: hundredths(-4500),
    bingo: Points.ZERO,
    full: hundredths(-4500),
    odds: odds(159),
  },
  serija: Points.ZERO,
};

const SURVIVAL: SurvivalPoints = {
  player: ADA,
  round: roundNo(1),
  team: FEN,
  points: hundredths(1200),
  provisional: false,
};

/** One row of each table, at the decimal edges: -45.00, 0.59, 631.1610, 0.0000 against null. */
const ROWS: PointsRows = {
  odds: [
    { game: gameNo(7), odds: CrowdOdds.stored(odds(159), odds(59), odds(259)) },
  ],
  matches: [MATCH],
  standings: [
    {
      player: ADA,
      team: ZAL,
      place: {
        points: tenThousandths(6_311_610),
        odds: unwrap(StandingsOdds.ofTenThousandths(10_000)),
      },
      playOffs: { points: StandingsPoints.ZERO, odds: null },
      finalFour: { points: null, odds: null },
      final: { points: null, odds: null },
    },
  ],
  survival: [SURVIVAL],
};

const NO_ROWS: PointsRows = {
  odds: [],
  matches: [],
  standings: [],
  survival: [],
};

describe('saveTournamentPoints and loadTournamentPoints', () => {
  it('read back every row exactly, as the decimal text Postgres holds', async () => {
    await saveTournamentPoints(db, TOURNAMENT, ROWS);
    expect(await loadTournamentPoints(db, TOURNAMENT)).toEqual(ROWS);
    const stored = await client.query(
      `select m.margin, m.odds, s.place_points, s.play_offs_points, s.final_points
       from match_points m, standings_points s`,
    );
    expect(stored.rows).toEqual([
      {
        margin: '-45.00',
        odds: '1.59',
        place_points: '631.1610',
        play_offs_points: '0.0000',
        final_points: null,
      },
    ]);
  });

  it('leave one set of rows when saved twice', async () => {
    await saveTournamentPoints(db, TOURNAMENT, ROWS);
    await saveTournamentPoints(db, TOURNAMENT, ROWS);
    expect(await loadTournamentPoints(db, TOURNAMENT)).toEqual(ROWS);
  });

  it('replace the rows with the new ones', async () => {
    await saveTournamentPoints(db, TOURNAMENT, ROWS);
    const moved: PointsRows = {
      ...NO_ROWS,
      matches: [{ ...MATCH, player: BEN }],
    };
    await saveTournamentPoints(db, TOURNAMENT, moved);
    expect(await loadTournamentPoints(db, TOURNAMENT)).toEqual(moved);
  });

  // Its deletes are scoped to the tournament's games and teams, so a row of
  // another tournament's could never be replaced.
  it.each([
    [
      'odds for a game',
      { odds: ROWS.odds },
      /game 7 is not a game of tournament 4/,
    ],
    [
      'match points for a game',
      { matches: ROWS.matches },
      /game 7 is not a game of tournament 4/,
    ],
    [
      'standings points for a team',
      { standings: ROWS.standings },
      /team 11 is not a team of tournament 4/,
    ],
  ] as const)(
    'refuse %s of another tournament, saving none',
    async (_, rows, message) => {
      await saveTournament(db, OTHER);
      // ADA plays OTHER too: the game or team is the one stray in the rows.
      await savePlaying(db, OTHER, ADA);
      await expect(
        saveTournamentPoints(db, OTHER, { ...NO_ROWS, ...rows }),
      ).rejects.toThrow(message);
      const counts = await client.query(
        `select (select count(*) from game_odds) as odds,
                (select count(*) from match_points) as matches,
                (select count(*) from standings_points) as standings`,
      );
      expect(counts.rows).toEqual([
        { odds: '0', matches: '0', standings: '0' },
      ]);
    },
  );
});

// The production and sportbet rows in the live database are retired history:
// nothing reads or writes them. Seeded by raw SQL beside the live rows, every
// loader and every total must ignore them, and a save must leave them be.
describe('retired points rows', () => {
  const rowsOf = async (table: string, source: string) =>
    (
      await client.query<{ n: number }>(
        `select count(*)::int as n from ${table} where source = $1`,
        [source],
      )
    ).rows[0]?.n;

  beforeEach(() => seedRetiredRows(client, TOURNAMENT.id));

  it('are seeded in all four tables, for both retired sources', async () => {
    for (const table of [
      'game_odds',
      'match_points',
      'standings_points',
      'survival_points',
    ]) {
      expect([table, await rowsOf(table, 'production')]).not.toEqual([
        table,
        0,
      ]);
      expect([table, await rowsOf(table, 'sportbet')]).not.toEqual([table, 0]);
    }
  });

  it('are not read by any loader, and are in no total', async () => {
    expect(await loadTournamentPoints(db, TOURNAMENT)).toEqual(NO_ROWS);
    expect(await loadGameOdds(db, TOURNAMENT)).toEqual([]);
    const { totals, scored, rows } = await loadTournamentTotals(
      db,
      TOURNAMENT,
      [ADA, BEN],
    );
    expect(rows).toEqual(NO_ROWS);
    expect(scored.size).toBe(0);
    expect(
      totals.map(({ match, serija, standings, survival }) => [
        match.hundredths,
        serija.hundredths,
        standings.tenThousandths,
        survival.hundredths,
      ]),
    ).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const inputs = unwrap(await loadTournamentInputs(db, TOURNAMENT));
    expect(inputs.odds).toEqual(new Map());
  });

  it('stay as they were when live rows are saved, and the live rows are the only ones read', async () => {
    const retired = await countRetiredRows(client);
    await saveTournamentPoints(db, TOURNAMENT, ROWS);
    await saveTournamentPoints(db, TOURNAMENT, ROWS);
    expect(await countRetiredRows(client)).toEqual(retired);
    expect(await loadTournamentPoints(db, TOURNAMENT)).toEqual(ROWS);
    const { totals } = await loadTournamentTotals(db, TOURNAMENT, [ADA]);
    expect(totals[0]?.match.hundredths).toBe(-4500);
    expect(totals[0]?.survival.hundredths).toBe(1200);
  });
});
