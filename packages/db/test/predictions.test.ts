import {
  MatchPrediction,
  refuse,
  StandingsPrediction,
  SurvivalRun,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  teamPick,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadMatchPredictions,
  loadTournamentInputs,
  loadStandingsPredictions,
  loadSurvivalRuns,
  saveGames,
  saveMatchPredictions,
  saveStandingsPredictions,
  saveSurvivalPicks,
  saveTournament,
  saveTournamentPlayers,
  type InputReads,
} from '../src';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  GAMES,
  OLY,
  OTHER,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('prediction repository', () => {
  beforeEach(() => saveGames(db, TOURNAMENT, GAMES));

  const stored = (row: Parameters<typeof MatchPrediction.stored>[0]) =>
    unwrap(MatchPrediction.stored(row));

  it('reads back real, half-typed, blank and filled-in rows, by game then player', async () => {
    const predictions = [
      stored({
        player: BEN,
        game: gameNo(7),
        home: 79,
        away: 88,
        origin: 'real',
        filledInAt: null,
      }),
      stored({
        player: ADA,
        game: gameNo(7),
        home: 85,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
      stored({
        player: ADA,
        game: gameNo(8),
        home: null,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
      stored({
        player: CAI,
        game: gameNo(8),
        home: 90,
        away: 80,
        origin: 'fill-in',
        filledInAt: null,
      }),
      stored({
        player: CAI,
        game: gameNo(9),
        home: 81,
        away: 77,
        origin: 'late-fill-in',
        filledInAt: at('2026-10-01T09:00:00Z'),
      }),
    ];
    await saveMatchPredictions(db, TOURNAMENT, predictions);
    expect(await loadMatchPredictions(db, TOURNAMENT)).toEqual([
      predictions[1],
      predictions[0],
      predictions[2],
      predictions[3],
      predictions[4],
    ]);
  });

  it('keeps one row per player and game: a second save replaces the first', async () => {
    const first = stored({
      player: ADA,
      game: gameNo(7),
      home: 85,
      away: 80,
      origin: 'fill-in',
      filledInAt: null,
    });
    const saved = stored({
      player: ADA,
      game: gameNo(7),
      home: 90,
      away: 80,
      origin: 'real',
      filledInAt: null,
    });
    await saveMatchPredictions(db, TOURNAMENT, [first]);
    await saveMatchPredictions(db, TOURNAMENT, [saved]);
    expect(await loadMatchPredictions(db, TOURNAMENT)).toEqual([saved]);
  });

  it('refuses a prediction for a game of another tournament, saving none', async () => {
    await saveTournament(db, OTHER);
    const prediction = stored({
      player: ADA,
      game: gameNo(7),
      home: 85,
      away: 80,
      origin: 'real',
      filledInAt: null,
    });
    await expect(saveMatchPredictions(db, OTHER, [prediction])).rejects.toThrow(
      /game 7 is not a game of tournament 4/,
    );
    expect(await loadMatchPredictions(db, TOURNAMENT)).toEqual([]);
  });
});

describe('standings repository', () => {
  it("reads back each player's rows - place 0, final place 3, never saved and unticked - one prediction per player", async () => {
    const ada = unwrap(
      StandingsPrediction.stored(ADA, [
        teamPick('11', { place: 1, playOffs: true, finalFour: false }),
        teamPick('12', { place: 0, finalPlace: 3 }),
      ]),
    );
    const ben = unwrap(
      StandingsPrediction.stored(BEN, [teamPick('13', { playOffs: false })]),
    );
    await saveStandingsPredictions(db, TOURNAMENT, [ben, ada]);
    expect(await loadStandingsPredictions(db, TOURNAMENT)).toEqual([ada, ben]);
  });

  it('refuses a row for a team of another tournament, saving none', async () => {
    await saveTournament(db, OTHER);
    const ada = unwrap(
      StandingsPrediction.stored(ADA, [teamPick('11', { place: 1 })]),
    );
    await expect(saveStandingsPredictions(db, OTHER, [ada])).rejects.toThrow(
      /team 11 is not a team of tournament 4/,
    );
    expect(await loadStandingsPredictions(db, TOURNAMENT)).toEqual([]);
  });
});

describe('survival repository', () => {
  it("reads back each player's pick history, by player then round", async () => {
    const runs = new Map([
      [BEN, unwrap(SurvivalRun.stored([{ round: roundNo(1), team: FEN }]))],
      [
        ADA,
        unwrap(
          SurvivalRun.stored([
            { round: roundNo(2), team: ZAL },
            { round: roundNo(1), team: FEN },
          ]),
        ),
      ],
    ]);
    await saveSurvivalPicks(db, TOURNAMENT, runs);
    const loaded = await loadSurvivalRuns(db, TOURNAMENT);
    expect([...loaded.keys()]).toEqual([ADA, BEN]);
    expect(loaded.get(ADA)).toEqual(runs.get(ADA));
    expect(loaded.get(BEN)).toEqual(runs.get(BEN));
  });

  it('replaces the team of a round picked again', async () => {
    const pick = (team: typeof ZAL) =>
      new Map([
        [ADA, unwrap(SurvivalRun.stored([{ round: roundNo(1), team }]))],
      ]);
    await saveSurvivalPicks(db, TOURNAMENT, pick(ZAL));
    await saveSurvivalPicks(db, TOURNAMENT, pick(OLY));
    expect((await loadSurvivalRuns(db, TOURNAMENT)).get(ADA)?.picks).toEqual([
      { round: roundNo(1), team: OLY },
    ]);
  });

  it('refuses a pick in a round the tournament does not have', async () => {
    await expect(
      saveSurvivalPicks(
        db,
        TOURNAMENT,
        new Map([
          [
            player('1'),
            unwrap(SurvivalRun.stored([{ round: roundNo(3), team: ZAL }])),
          ],
        ]),
      ),
    ).rejects.toThrow(/tournament 3 has no round 3/);
  });
});

describe('loadTournamentInputs', () => {
  beforeEach(() => saveGames(db, TOURNAMENT, GAMES));

  const FROM_VOTES: InputReads = { odds: 'from-votes', survival: 'picks' };
  const AS_STORED: InputReads = { odds: 'stored', survival: 'stored-rows' };
  const READS = [FROM_VOTES, AS_STORED];
  const REFUSED = refuse('row-of-player-not-in-tournament');
  const playing = (...players: readonly (typeof ADA)[]) =>
    saveTournamentPlayers(
      db,
      TOURNAMENT,
      players.map((each) => ({
        player: each,
        switchedOff: false,
        adminHidden: false,
        fillIns: 0,
      })),
    );
  const prediction = (of: typeof ADA) =>
    unwrap(
      MatchPrediction.stored({
        player: of,
        game: gameNo(7),
        home: 80,
        away: 70,
        origin: 'real',
        filledInAt: null,
      }),
    );

  it("reads the rows of the tournament's players", async () => {
    await playing(ADA);
    await saveMatchPredictions(db, TOURNAMENT, [prediction(ADA)]);
    for (const reads of READS) {
      const inputs = unwrap(await loadTournamentInputs(db, TOURNAMENT, reads));
      expect([inputs.players, inputs.predictions]).toEqual([
        [ADA],
        [prediction(ADA)],
      ]);
    }
  });

  it('refuses a prediction or a standings row of a player who is not playing the tournament', async () => {
    await playing(ADA);
    await saveMatchPredictions(db, TOURNAMENT, [prediction(BEN)]);
    expect(await loadTournamentInputs(db, TOURNAMENT, FROM_VOTES)).toEqual(
      REFUSED,
    );

    await playing(ADA, BEN);
    await saveStandingsPredictions(db, TOURNAMENT, [
      unwrap(StandingsPrediction.stored(CAI, [teamPick('11', { place: 1 })])),
    ]);
    expect(await loadTournamentInputs(db, TOURNAMENT, AS_STORED)).toEqual(
      REFUSED,
    );

    await playing(ADA, BEN, CAI);
    expect((await loadTournamentInputs(db, TOURNAMENT, FROM_VOTES)).ok).toBe(
      true,
    );
  });
});
