import { Game, MatchPrediction, Round } from '@sportbet/domain';
import {
  at,
  gameNo,
  rate,
  roundNo,
  team,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadRoundNames, loadStartedPredictions } from '../src';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames, saveRounds } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  G10,
  G7,
  G9,
  FEN,
  OTHER,
  saveWorld,
  savePlaying,
  TOURNAMENT,
  ZAL,
} from './world';

const { db } = useTestDatabase();

const TIP_OFF = '2026-10-05T18:00:00Z';
const unscored = (id: number, tipOff: string) =>
  unwrap(
    Game.schedule({
      id: gameNo(id),
      round: roundNo(1),
      home: ZAL,
      away: FEN,
      tipOff: at(tipOff),
    }),
  );
const G31 = unscored(31, TIP_OFF);

const call = (
  player: typeof ADA,
  game: number,
  home: number | null,
  away: number | null,
) =>
  unwrap(
    MatchPrediction.stored({
      player,
      game: gameNo(game),
      home,
      away,
      origin: 'real',
      filledInAt: null,
    }),
  );

const read = (now: string, players = [ADA, BEN, CAI]) =>
  loadStartedPredictions(db, { tournament: TOURNAMENT, players, now: at(now) });

beforeEach(async () => {
  await saveWorld(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
});

describe('loadStartedPredictions', () => {
  beforeEach(async () => {
    await saveGames(db, TOURNAMENT, [G31]);
    await saveMatchPredictions(db, TOURNAMENT, [
      call(ADA, 31, 85, 80),
      call(BEN, 31, 70, 90),
    ]);
  });

  it('reads a game at its tip-off instant, and not one second before', async () => {
    expect(await read(TIP_OFF)).toEqual([
      { player: ADA, game: gameNo(31), home: 85, away: 80 },
      { player: BEN, game: gameNo(31), home: 70, away: 90 },
    ]);
    expect(await read('2026-10-05T17:59:59Z')).toEqual([]);
  });

  it('reads only the players asked for (R-73)', async () => {
    expect(await read(TIP_OFF, [BEN])).toEqual([
      { player: BEN, game: gameNo(31), home: 70, away: 90 },
    ]);
    expect(await read(TIP_OFF, [])).toEqual([]);
  });

  it('returns a blank row with null scores', async () => {
    await saveMatchPredictions(db, TOURNAMENT, [call(CAI, 31, null, null)]);
    expect(await read(TIP_OFF, [CAI])).toEqual([
      { player: CAI, game: gameNo(31), home: null, away: null },
    ]);
  });

  it('reads a scored game and a locked game before their tip-off', async () => {
    await saveGames(db, TOURNAMENT, [G7, G10]);
    await saveMatchPredictions(db, TOURNAMENT, [
      call(ADA, 7, 85, 80),
      call(ADA, 10, 90, 85),
    ]);
    expect(
      (await read('2026-10-01T00:00:00Z')).map(({ game }) => game),
    ).toEqual([gameNo(7), gameNo(10)]);
  });

  it('never reads another tournament`s games (R-86)', async () => {
    await saveTournament(db, OTHER);
    await saveTeams(db, OTHER, [
      { id: team('21'), name: 'Alba' },
      { id: team('22'), name: 'Baskonia' },
    ]);
    await saveRounds(db, OTHER, [
      {
        id: 31,
        name: 'Other 1',
        round: Round.stored({
          number: roundNo(1),
          stage: 'regular',
          rate: rate(1),
          survival: true,
          knockout: false,
        }),
      },
    ]);
    await saveGames(db, OTHER, [
      unwrap(
        Game.schedule({
          id: gameNo(50),
          round: roundNo(1),
          home: team('21'),
          away: team('22'),
          tipOff: at('2026-10-01T18:00:00Z'),
        }),
      ),
    ]);
    await savePlaying(db, OTHER, ADA);
    await saveMatchPredictions(db, OTHER, [call(ADA, 50, 85, 80)]);
    expect(
      (await read('2026-10-06T00:00:00Z')).map(({ game }) => game),
    ).toEqual([gameNo(31), gameNo(31)]);
  });

  it('leaves the judging of a postponed game to the domain, reading it only once its tip-off has passed', async () => {
    await saveGames(db, TOURNAMENT, [G9]);
    await saveMatchPredictions(db, TOURNAMENT, [call(ADA, 9, 85, 80)]);
    expect(await read('2026-10-09T00:00:00Z', [ADA])).toEqual([
      { player: ADA, game: gameNo(31), home: 85, away: 80 },
    ]);
    expect(await read('2026-10-10T17:30:00Z', [ADA])).toHaveLength(2);
  });
});

describe('loadRoundNames', () => {
  it('returns every round`s name by number', async () => {
    expect(await loadRoundNames(db, TOURNAMENT)).toEqual(
      new Map([
        [roundNo(1), '1 turas'],
        [roundNo(2), '2 turas'],
      ]),
    );
  });

  it('returns only the tournament`s own rounds', async () => {
    await saveTournament(db, OTHER);
    expect(await loadRoundNames(db, OTHER)).toEqual(new Map());
  });
});
