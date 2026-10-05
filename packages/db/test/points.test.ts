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
  countPointsRows,
  countStoredRows,
  SIGN_IN_TABLES,
  STORED_TABLES,
  loadStoredSurvivalRows,
  loadTournamentPoints,
} from '../src';
import { saveTournamentPoints } from '../src/points/repository';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
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

/** A production row: its stored id is its own, sportbet's. */
const SURVIVAL: SurvivalPoints = {
  player: ADA,
  round: roundNo(1),
  team: FEN,
  points: hundredths(1200),
  provisional: false,
  storedId: 41,
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

/** The same rows as a rule set derives them: the survival row rewrites 41. */
const DERIVED: PointsRows = ROWS;

describe('saveTournamentPoints and loadTournamentPoints', () => {
  it('read back every row exactly, as the decimal text Postgres holds', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await loadTournamentPoints(db, TOURNAMENT, 'production')).toEqual(
      ROWS,
    );
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

  it("keep a production survival row's sportbet id, and read it back as a stored row", async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await loadStoredSurvivalRows(db, TOURNAMENT, 'production')).toEqual([
      {
        id: 41,
        player: ADA,
        round: roundNo(1),
        team: FEN,
        storedPoints: hundredths(1200),
      },
    ]);
  });

  it('read the stored survival rows of the source they are named only', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await loadStoredSurvivalRows(db, TOURNAMENT, 'ruled')).toEqual([]);
  });

  it('refuse to read a derived survival row as a stored row: it has no sportbet id', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    await expect(
      loadStoredSurvivalRows(db, TOURNAMENT, 'sportbet'),
    ).rejects.toThrow(/sportbet survival row .* is derived, not a stored row/);
  });

  it('leave one set of rows when saved twice under one source, and the other sources untouched', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', {
      ...ROWS,
      survival: [{ ...SURVIVAL, storedId: null }],
    });
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await countPointsRows(db, TOURNAMENT)).toEqual({
      game_odds: { production: 1, sportbet: 1, ruled: 1 },
      match_points: { production: 1, sportbet: 1, ruled: 1 },
      standings_points: { production: 1, sportbet: 1, ruled: 1 },
      survival_points: { production: 1, sportbet: 1, ruled: 1 },
    });
    expect(await loadTournamentPoints(db, TOURNAMENT, 'sportbet')).toEqual(
      DERIVED,
    );
  });

  it('replace the rows of a source with the new ones', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', DERIVED);
    const moved: PointsRows = {
      odds: [],
      matches: [{ ...MATCH, player: BEN }],
      standings: [],
      survival: [],
    };
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', moved);
    expect(await loadTournamentPoints(db, TOURNAMENT, 'ruled')).toEqual(moved);
  });

  it('never relabel a derived survival row as production when a newer dump brings higher production ids', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    const ruled: PointsRows = {
      ...ROWS,
      survival: [{ ...SURVIVAL, storedId: null }],
    };
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', ruled);
    const derivedRows = `select id, source from survival_points where source <> 'production' order by id`;
    const before = (await client.query(derivedRows)).rows;

    // The newer dump: 41 again, and the next ids sportbet handed out.
    const newer: PointsRows = {
      ...ROWS,
      survival: [
        SURVIVAL,
        { ...SURVIVAL, round: roundNo(2), storedId: 42 },
        { ...SURVIVAL, round: roundNo(2), team: ZAL, storedId: 43 },
      ],
    };
    await saveTournamentPoints(db, TOURNAMENT, 'production', newer);

    expect((await client.query(derivedRows)).rows).toEqual(before);
    expect(await loadTournamentPoints(db, TOURNAMENT, 'production')).toEqual(
      newer,
    );
    expect(await loadTournamentPoints(db, TOURNAMENT, 'sportbet')).toEqual(
      DERIVED,
    );
    expect(await loadTournamentPoints(db, TOURNAMENT, 'ruled')).toEqual(ruled);
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
        saveTournamentPoints(db, OTHER, 'ruled', {
          odds: [],
          matches: [],
          standings: [],
          survival: [],
          ...rows,
        }),
      ).rejects.toThrow(message);
      expect(await countPointsRows(db, TOURNAMENT)).toMatchObject({
        game_odds: { ruled: 0 },
        match_points: { ruled: 0 },
        standings_points: { ruled: 0 },
      });
    },
  );

  it('refuse a production survival row without its stored id', async () => {
    await expect(
      saveTournamentPoints(db, TOURNAMENT, 'production', {
        ...ROWS,
        survival: [{ ...SURVIVAL, storedId: null }],
      }),
    ).rejects.toThrow(/production survival row.*needs its id/);
  });
});

describe('countStoredRows', () => {
  it('counts the rows of every table a load writes, the points tables for the named source only', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    const counts = {
      tournaments: 1,
      rounds: 2,
      teams: 4,
      team_outcomes: 0,
      games: 1,
      players: 3,
      player_settings: 0,
      tournament_players: 2,
      match_predictions: 0,
      standings_predictions: 0,
      survival_picks: 0,
    };
    expect(await countStoredRows(db, 'production')).toEqual({
      ...counts,
      game_odds: 1,
      match_points: 1,
      standings_points: 1,
      survival_points: 1,
    });
    expect(await countStoredRows(db, 'ruled')).toEqual({
      ...counts,
      game_odds: 0,
      match_points: 0,
      standings_points: 0,
      survival_points: 0,
    });
  });

  it('names every table the schema has', async () => {
    const tables = await client.query<{ name: string }>(
      "select tablename as name from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(tables.rows.map(({ name }) => name)).toEqual(
      [...STORED_TABLES, ...SIGN_IN_TABLES].sort(),
    );
  });
});
