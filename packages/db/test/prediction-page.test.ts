import { MatchPrediction, ruledRules, sportbetRules } from '@sportbet/domain';
import { at, gameNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadMissingResultPredictions,
  loadPlayerPredictions,
  loadPredictionsPage,
  loadSeason,
  loadTournamentPoints,
  recalculateLocked,
} from '../src';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  G10_OPEN,
  G7,
  G8,
  G9,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

const predict = (
  player: typeof ADA,
  game: number,
  home: number | null,
  away: number | null,
) => unwrap(MatchPrediction.enter({ player, game: gameNo(game), home, away }));

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await saveMatchPredictions(db, TOURNAMENT, [
    predict(ADA, 7, 88, 79),
    predict(ADA, 8, 85, 80),
    predict(ADA, 9, null, null),
    predict(ADA, 10, null, null),
    predict(BEN, 7, 70, 80),
    predict(BEN, 10, 85, 80),
    predict(CAI, 10, 90, 70),
  ]);
  const refusal = await recalculateLocked(db, TOURNAMENT, ruledRules);
  if (refusal !== null)
    throw new Error(`the recalculation refused: ${refusal}`);
});

const page = (requested: string | null, rules = ruledRules) =>
  loadPredictionsPage(db, {
    player: ADA,
    tournament: TOURNAMENT,
    requested,
    now: NOW,
    rules,
  });

const gamesOf = async (requested: string | null, rules = ruledRules) =>
  (await page(requested, rules)).lines.map(({ game }) => game);

describe('loadPredictionsPage (getPredictionResultsUser)', () => {
  it('list: the menu lists every round by number, with its id and name', async () => {
    expect((await page(null)).rounds).toEqual([
      { id: 21, name: '1 turas' },
      { id: 22, name: '2 turas' },
    ]);
  });

  it("list: with no ?event, the current round under the rule set (ruled R-6: game 10's; sportbet: game 9's)", async () => {
    expect(await gamesOf(null)).toEqual([7, 10]);
    expect((await page(null)).selected).toBe(21);
    expect(await gamesOf(null, sportbetRules)).toEqual([8, 9]);
  });

  it('list: ?event names a round by its id; an unknown one shows nothing; "all" shows every round (R-58)', async () => {
    expect(await gamesOf('22')).toEqual([8, 9]);
    expect(await gamesOf('99')).toEqual([]);
    expect((await page('99')).selected).toBe(99);
    expect(await gamesOf('all')).toEqual([7, 8, 9, 10]);
    expect((await page('all')).selected).toBe('all');
  });

  it("list: only the player's own rows, each with its round, teams and prediction", async () => {
    const lines = (await page('all')).lines;
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({
      game: 7,
      round: 1,
      roundName: '1 turas',
      home: 'Zalgiris',
      away: 'Olympiacos',
      predicted: { home: 88, away: 79 },
    });
  });

  it("list: a scored row carries its result and the rule set's points, and no panel", async () => {
    const scored = (await page('all')).lines.find(({ game }) => game === 7);
    const stored = (
      await loadTournamentPoints(db, TOURNAMENT, ruledRules.name)
    ).matches.find(({ player, game }) => player === ADA && game === 7);
    expect(scored?.state).toBe('scored');
    expect(scored?.result).toEqual({ home: 88, away: 79 });
    expect(scored?.points?.full.hundredths).toBe(
      stored?.points.full.hundredths,
    );
    expect(scored?.points?.serija.hundredths).toBe(stored?.serija.hundredths);
    expect(scored?.panel).toBeNull();
  });

  it("list: an open row's panel is from the game's votes now, at the round's rate (odds on read)", async () => {
    const open = (await page('all')).lines.find(({ game }) => game === 10);
    expect(open?.state).toBe('open');
    expect(open?.result).toBeNull();
    // Two home votes of two: home odds log2(2/2) = 0, away log2(2/0.5) = 2.
    expect(open?.panel?.home.hundredths).toBe(5000);
    expect(open?.panel?.away.hundredths).toBe(15000);
  });

  it('list: a started unscored row is locked, with its panel (rate 2, no votes)', async () => {
    const locked = (await page('all')).lines.find(({ game }) => game === 9);
    expect(locked?.state).toBe('locked');
    expect(locked?.panel?.home.hundredths).toBe(10000);
  });
});

describe('loadMissingResultPredictions (the "Spėjimai" badge)', () => {
  it("badge: the current round's open games ADA has not answered", async () => {
    const season = await loadSeason(db, TOURNAMENT);
    const missing = () =>
      loadMissingResultPredictions(db, {
        player: ADA,
        tournament: TOURNAMENT,
        season,
        now: NOW,
        rules: ruledRules,
      });
    expect(await missing()).toBe(1);
    await saveMatchPredictions(db, TOURNAMENT, [predict(ADA, 10, 81, 77)]);
    expect(await missing()).toBe(0);
  });

  it("loadPlayerPredictions: the player's rows only, by game", async () => {
    const rows = await loadPlayerPredictions(db, BEN, TOURNAMENT);
    expect(rows.map(({ game, home }) => [game, home])).toEqual([
      [7, 70],
      [10, 85],
    ]);
  });
});
