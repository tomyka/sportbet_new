import {
  MatchPrediction,
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
  loadStandingsPredictions,
  loadSurvivalRuns,
  saveGames,
  saveMatchPredictions,
  saveStandingsPredictions,
  saveSurvivalPicks,
} from '../src';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  GAMES,
  OLY,
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
    await saveMatchPredictions(db, predictions);
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
    await saveMatchPredictions(db, [first]);
    await saveMatchPredictions(db, [saved]);
    expect(await loadMatchPredictions(db, TOURNAMENT)).toEqual([saved]);
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
    await saveStandingsPredictions(db, [ben, ada]);
    expect(await loadStandingsPredictions(db, TOURNAMENT)).toEqual([ada, ben]);
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
