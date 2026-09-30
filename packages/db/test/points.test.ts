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
  loadStoredSurvivalRows,
  loadTournamentPoints,
  saveGames,
  saveTournamentPoints,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, FEN, OLY, saveWorld, TOURNAMENT, ZAL } from './world';

const { db, client } = useTestDatabase();

beforeEach(async () => {
  await saveWorld(db);
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
    oddsPoints: Points.ZERO,
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
    expect(await loadStoredSurvivalRows(db, TOURNAMENT)).toEqual([
      {
        id: 41,
        player: ADA,
        round: roundNo(1),
        team: FEN,
        storedPoints: hundredths(1200),
      },
    ]);
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

  it('refuse a production survival row without its stored id', async () => {
    await expect(
      saveTournamentPoints(db, TOURNAMENT, 'production', {
        ...ROWS,
        survival: [{ ...SURVIVAL, storedId: null }],
      }),
    ).rejects.toThrow(/production survival row.*needs its id/);
  });
});
