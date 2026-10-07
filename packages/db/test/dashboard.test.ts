// The game page's data (MainController::loadApp) on sportbet's golden
// scenario, under both sets.

import {
  ruledRules,
  sportbetRules,
  type Instant,
  type PlayerId,
  type RuleSet,
} from '@sportbet/domain';
import { at, goldenInputs, roundNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadDashboard, recalculateLocked } from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

beforeEach(() => saveGolden(db));

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');
const dan = IDS.player('dan');

/** Vilnius in June is UTC+3. */
const vilniusDay = (instant: Instant): string =>
  new Date(instant + 3 * 3_600_000).toISOString().slice(0, 10);

/** After the last golden game (06-20 18:00 UTC). */
const AFTER = at('2026-06-21T08:00:00Z');

async function dashboardOf(
  who: PlayerId,
  rules: RuleSet,
  now: Instant = AFTER,
) {
  expect(await recalculateLocked(db, GOLDEN_EL, rules)).toBeNull();
  return loadDashboard(db, {
    player: who,
    tournament: GOLDEN_EL,
    now,
    rules,
    vilniusDay,
  });
}

describe('loadDashboard (MainController::loadApp)', () => {
  it("the player's own row, rank change and tiles under sportbetRules", async () => {
    const dashboard = await dashboardOf(ada, sportbetRules);
    expect(dashboard.table.rows.map(({ username }) => username)).toEqual([
      'ada',
      'ben',
      'cai',
      'dan',
    ]);
    expect(dashboard.me?.row).toMatchObject({ player: ada, rank: 1 });
    expect(dashboard.me?.rankChange).toBe(0);
    // h3 named the winner, h2 did not; one exact score (h3).
    expect(dashboard.me?.tiles).toEqual({ bingo: 1, serija: 1 });
  });

  it('the rank change reads the ruled history (R-17): 2 three games back, 1 now', async () => {
    const dashboard = await dashboardOf(ada, ruledRules);
    expect(dashboard.me?.row.history.map(({ rank }) => rank)).toEqual([
      2, 3, 1,
    ]);
    expect(dashboard.me?.rankChange).toBe(1);
  });

  it("serija: every one of cai's games named the winner (R-71)", async () => {
    const dashboard = await dashboardOf(cai, ruledRules);
    expect(dashboard.me?.tiles).toEqual({ bingo: 0, serija: 3 });
  });

  it('a listed player without a scored row has a row but no tiles', async () => {
    const dashboard = await dashboardOf(dan, ruledRules);
    expect(dashboard.me?.row).toMatchObject({ player: dan, rank: 4 });
    expect(dashboard.me?.tiles).toBeNull();
  });

  it('a player not listed has no own row and no tiles', async () => {
    await saveTournamentPlayers(db, GOLDEN_EL, [
      { player: ben, switchedOff: true, adminHidden: false, fillIns: 0 },
    ]);
    const dashboard = await dashboardOf(ben, ruledRules);
    expect(dashboard.me).toBeNull();
    expect(dashboard.table.rows.map(({ username }) => username)).toEqual([
      'ada',
      'cai',
      'dan',
    ]);
  });

  it("the progress line: the current round's name, scored and total, and today's games", async () => {
    const dashboard = await dashboardOf(ada, ruledRules);
    expect(dashboard.progress).toEqual({
      round: roundNo(2),
      name: 'EL E2',
      scored: 1,
      total: 1,
      today: 0,
    });
  });

  it('the medals: none before the first tip-off, the listed final places after', async () => {
    const before = await dashboardOf(
      ada,
      ruledRules,
      at('2026-06-15T08:00:00Z'),
    );
    expect(before.medals).toBeNull();
    // The golden scenario has no final places.
    expect((await dashboardOf(ada, ruledRules)).medals).toEqual([]);
  });

  it("the feed: the scored games' bingos and the live runs of the listed players", async () => {
    const dashboard = await dashboardOf(ada, ruledRules);
    expect(dashboard.feed).toEqual({
      bingos: [{ game: IDS.game(3), line: 'ZAL 90-85 FEN', players: 'ada' }],
      runs: [{ username: 'cai', length: 3 }],
    });
  });
});

describe("loadDashboard: the game page's games (8b)", () => {
  it('before the first tip-off: the current round\'s open games, each offering "Spėti"', async () => {
    await saveGames(
      db,
      GOLDEN_EL,
      goldenInputs({}, IDS).season.games.map((game) => game.withoutResult()),
    );
    const dashboard = await dashboardOf(
      ada,
      ruledRules,
      at('2026-06-15T08:00:00Z'),
    );
    expect(
      dashboard.games?.map(({ game, state, predict, predicted }) => [
        game,
        state,
        predict,
        predicted,
      ]),
    ).toEqual([
      [IDS.game(1), 'open', true, { home: 85, away: 80 }],
      [IDS.game(2), 'open', true, { home: 120, away: 50 }],
    ]);
  });

  it('a game played today stays, with its points and no "Spėti" (R-75)', async () => {
    const dashboard = await dashboardOf(
      ada,
      ruledRules,
      at('2026-06-20T20:00:00Z'),
    );
    expect(
      dashboard.games?.map(({ game, state, predict, points }) => [
        game,
        state,
        predict,
        points?.full.toString(),
      ]),
    ).toEqual([[IDS.game(3), 'scored', false, '179.50']]);
  });

  it('a game played on an earlier Vilnius day is dropped', async () => {
    const dashboard = await dashboardOf(ada, ruledRules);
    expect(dashboard.games).toEqual([]);
  });
});
