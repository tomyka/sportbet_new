// saveTournamentSnapshot: one tournament's inputs saved in one transaction,
// every row checked against the tournament's own rounds, teams, games and
// players (the tournament scope) - a stray row throws, and nothing is saved.

import {
  CrowdOdds,
  Game,
  MatchPrediction,
  Odds,
  Points,
  Round,
  StandingsPoints,
  StandingsPrediction,
  SurvivalRun,
  TeamOutcomes,
  type PlayerId,
  type PointsRows,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type TeamId,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  rate,
  roundNo,
  team,
  teamOutcome,
  teamPick,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findTournamentBySlug,
  loadTournamentInputs,
  savePlayers,
  saveTournamentSnapshot,
  type TournamentSnapshot,
} from '../src';
import { saveTournamentPoints } from '../src/points/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  GAMES,
  OLY,
  OTHER,
  ROUNDS,
  TEAMS,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

const NO_POINTS: PointsRows = {
  odds: [],
  matches: [],
  standings: [],
  survival: [],
};

const playing = (...players: readonly PlayerId[]) =>
  players.map((player) => ({
    player,
    switchedOff: false,
    adminHidden: false,
    fillIns: 0,
  }));

/** OTHER's own team, round and game: each a stray row in TOURNAMENT. */
const PAR = team('31');
const MON = team('32');
const OTHER_GAME = unwrap(
  Game.stored({
    id: gameNo(50),
    round: roundNo(1),
    home: PAR,
    away: MON,
    tipOff: at('2026-10-02T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);
const OTHER_SNAPSHOT: TournamentSnapshot = {
  tournament: OTHER,
  teams: [
    { id: PAR, name: 'Partizan' },
    { id: MON, name: 'Monaco' },
  ],
  rounds: [
    {
      id: 41,
      name: '1 turas',
      round: Round.stored({
        number: roundNo(1),
        stage: 'regular',
        rate: rate(1),
        survival: true,
        knockout: false,
      }),
    },
  ],
  games: [OTHER_GAME],
  outcomes: unwrap(TeamOutcomes.stored([], false)),
  // CAI plays OTHER only: a stray player in TOURNAMENT.
  players: playing(CAI),
  predictions: [],
  standings: [],
  runs: new Map(),
};

const prediction = (player: PlayerId, game: number) =>
  unwrap(
    MatchPrediction.stored({
      player,
      game: gameNo(game),
      home: 80,
      away: 70,
      origin: 'real',
      filledInAt: null,
    }),
  );
const standing = (player: PlayerId, of: string) =>
  unwrap(StandingsPrediction.stored(player, [teamPick(of, { place: 1 })]));
const run = (round: number, of: TeamId) =>
  unwrap(SurvivalRun.stored([{ round: roundNo(round), team: of }]));
const gameIn = (id: number, round: number, home: TeamId, away = OLY) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(round),
      home,
      away,
      tipOff: at('2026-10-05T18:00:00Z'),
      result: null,
      recordedWinner: null,
      lockedSince: null,
      postponed: false,
    }),
  );

const hundredths = (value: number) => unwrap(Points.ofHundredths(value));
const oddsOf = (value: number) => unwrap(Odds.ofHundredths(value));
const matchRow = (player: PlayerId, game: number): StoredMatchRow => ({
  player,
  game: gameNo(game),
  points: {
    winner: hundredths(1000),
    margin: Points.ZERO,
    bingo: Points.ZERO,
    full: hundredths(1000),
    odds: oddsOf(100),
  },
  serija: Points.ZERO,
});
const standingsRow = (player: PlayerId, of: TeamId): StandingsRow => ({
  player,
  team: of,
  place: { points: StandingsPoints.ZERO, odds: null },
  playOffs: { points: null, odds: null },
  finalFour: { points: null, odds: null },
  final: { points: null, odds: null },
});
const survivalRow = (
  player: PlayerId,
  round: number,
  of: TeamId,
): SurvivalPoints => ({
  player,
  round: roundNo(round),
  team: of,
  points: hundredths(1200),
  provisional: false,
});

/** TOURNAMENT with one row in every table, ADA and BEN playing. */
const SNAPSHOT: TournamentSnapshot = {
  tournament: TOURNAMENT,
  teams: TEAMS,
  rounds: ROUNDS,
  games: GAMES,
  outcomes: unwrap(
    TeamOutcomes.stored([teamOutcome('11', { place: 1 })], false),
  ),
  players: playing(ADA, BEN),
  predictions: [prediction(ADA, 7), prediction(BEN, 7)],
  standings: [standing(ADA, '11')],
  runs: new Map([[ADA, run(1, ZAL)]]),
};

beforeEach(async () => {
  await savePlayers(db, [
    testPlayer(ADA, 'ada'),
    testPlayer(BEN, 'ben'),
    testPlayer(CAI, 'cai'),
  ]);
  await saveTournamentSnapshot(db, OTHER_SNAPSHOT);
});

async function countRows(): Promise<Record<string, number>> {
  const tables = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like '%drizzle%' order by table_name",
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of tables.rows) {
    const result = await client.query<{ rows: number }>(
      `select count(*)::int as rows from ${table_name}`,
    );
    counts[table_name] = result.rows[0]?.rows ?? 0;
  }
  return counts;
}

describe('saveTournamentSnapshot', () => {
  it("saves every input of the tournament, read back as the tournament's own", async () => {
    await saveTournamentSnapshot(db, SNAPSHOT);
    const inputs = unwrap(await loadTournamentInputs(db, TOURNAMENT));
    expect(inputs.players).toEqual([ADA, BEN]);
    expect(inputs.season.games).toEqual(GAMES);
    expect(inputs.predictions).toEqual(SNAPSHOT.predictions);
    expect(inputs.standings).toEqual(SNAPSHOT.standings);
    expect(inputs.outcomes).toEqual(SNAPSHOT.outcomes);
    expect(inputs.survival).toEqual(SNAPSHOT.runs);
  });

  it('leaves the same rows when the same snapshot is saved twice', async () => {
    await saveTournamentSnapshot(db, SNAPSHOT);
    const once = await countRows();
    await saveTournamentSnapshot(db, SNAPSHOT);
    expect(await countRows()).toEqual(once);
  });

  // Every save path, each with the stray rows its rows can name.
  it.each([
    [
      'a game in a round the tournament does not have',
      { ...SNAPSHOT, games: [...GAMES, gameIn(60, 3, ZAL)] },
      /saveGames: round 3 is not a round of tournament 3/,
    ],
    [
      "a game of another tournament's team",
      { ...SNAPSHOT, games: [...GAMES, gameIn(61, 1, PAR)] },
      /saveGames: team 31 is not a team of tournament 3/,
    ],
    [
      "a game against another tournament's team",
      { ...SNAPSHOT, games: [...GAMES, gameIn(62, 1, ZAL, MON)] },
      /saveGames: team 32 is not a team of tournament 3/,
    ],
    [
      "an outcome of another tournament's team",
      {
        ...SNAPSHOT,
        outcomes: unwrap(
          TeamOutcomes.stored([teamOutcome('31', { place: 1 })], false),
        ),
      },
      /saveTeamOutcomes: team 31 is not a team of tournament 3/,
    ],
    [
      "a prediction for another tournament's game",
      { ...SNAPSHOT, predictions: [prediction(ADA, 50)] },
      /saveMatchPredictions: game 50 is not a game of tournament 3/,
    ],
    [
      'a prediction of a player who is not playing',
      { ...SNAPSHOT, predictions: [prediction(CAI, 7)] },
      /saveMatchPredictions: player 3 is not a player of tournament 3/,
    ],
    [
      "a standings row for another tournament's team",
      { ...SNAPSHOT, standings: [standing(ADA, '31')] },
      /saveStandingsPredictions: team 31 is not a team of tournament 3/,
    ],
    [
      'a standings row of a player who is not playing',
      { ...SNAPSHOT, standings: [standing(CAI, '11')] },
      /saveStandingsPredictions: player 3 is not a player of tournament 3/,
    ],
    [
      'a survival pick in a round the tournament does not have',
      { ...SNAPSHOT, runs: new Map([[ADA, run(3, ZAL)]]) },
      /saveSurvivalPicks: round 3 is not a round of tournament 3/,
    ],
    [
      "a survival pick of another tournament's team",
      { ...SNAPSHOT, runs: new Map([[ADA, run(1, PAR)]]) },
      /saveSurvivalPicks: team 31 is not a team of tournament 3/,
    ],
    [
      'a survival pick of a player who is not playing',
      { ...SNAPSHOT, runs: new Map([[CAI, run(1, ZAL)]]) },
      /saveSurvivalPicks: player 3 is not a player of tournament 3/,
    ],
  ] as const)(
    'refuses %s, saving nothing of the snapshot',
    async (_, snapshot, message) => {
      const before = await countRows();
      await expect(saveTournamentSnapshot(db, snapshot)).rejects.toThrow(
        message,
      );
      expect(await countRows()).toEqual(before);
      expect(await findTournamentBySlug(db, TOURNAMENT.slug)).toBeUndefined();
    },
  );

  it('leaves the rows saved before when a later snapshot is refused', async () => {
    await saveTournamentSnapshot(db, SNAPSHOT);
    const before = await countRows();
    await expect(
      saveTournamentSnapshot(db, {
        ...SNAPSHOT,
        predictions: [prediction(CAI, 7)],
        tournament: { ...TOURNAMENT, name: 'Renamed' },
        players: playing(ADA),
      }),
    ).rejects.toThrow(/player 3 is not a player of tournament 3/);
    expect(await countRows()).toEqual(before);
    expect((await findTournamentBySlug(db, TOURNAMENT.slug))?.name).toBe(
      TOURNAMENT.name,
    );
  });
});

describe('saveTournamentPoints, on its own', () => {
  beforeEach(() => saveTournamentSnapshot(db, SNAPSHOT));

  it.each([
    [
      "odds for another tournament's game",
      {
        ...NO_POINTS,
        odds: [
          {
            game: gameNo(50),
            odds: CrowdOdds.stored(oddsOf(100), oddsOf(100), oddsOf(100)),
          },
        ],
      },
      /saveTournamentPoints: game 50 is not a game of tournament 3/,
    ],
    [
      "match points for another tournament's game",
      { ...NO_POINTS, matches: [matchRow(ADA, 50)] },
      /saveTournamentPoints: game 50 is not a game of tournament 3/,
    ],
    [
      "standings points for another tournament's team",
      { ...NO_POINTS, standings: [standingsRow(ADA, PAR)] },
      /saveTournamentPoints: team 31 is not a team of tournament 3/,
    ],
    [
      'standings points of a player who is not playing',
      { ...NO_POINTS, standings: [standingsRow(CAI, ZAL)] },
      /saveTournamentPoints: player 3 is not a player of tournament 3/,
    ],
    [
      'a player who is not playing',
      { ...NO_POINTS, matches: [matchRow(CAI, 7)] },
      /saveTournamentPoints: player 3 is not a player of tournament 3/,
    ],
    [
      'a round the tournament does not have',
      { ...NO_POINTS, survival: [survivalRow(ADA, 3, ZAL)] },
      /saveTournamentPoints: round 3 is not a round of tournament 3/,
    ],
    [
      "another tournament's team",
      { ...NO_POINTS, survival: [survivalRow(ADA, 1, PAR)] },
      /saveTournamentPoints: team 31 is not a team of tournament 3/,
    ],
  ] as const)('refuses a row of %s, saving none', async (_, rows, message) => {
    await expect(saveTournamentPoints(db, TOURNAMENT, rows)).rejects.toThrow(
      message,
    );
    expect(await countRows()).toMatchObject({
      game_odds: 0,
      match_points: 0,
      standings_points: 0,
      survival_points: 0,
    });
  });
});
