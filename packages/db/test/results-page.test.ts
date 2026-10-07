import { ruledRules } from '@sportbet/domain';
import { at, roundNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadResultsPage } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { G10_OPEN, G7, G8, G9, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
});

describe('loadResultsPage', () => {
  it("results page: the round's games with their teams' names, result, postponement and whether the boxes take input", async () => {
    const page = await loadResultsPage(db, {
      tournament: TOURNAMENT,
      round: roundNo(1),
      now: NOW,
      rules: ruledRules,
    });
    expect(page.rounds).toEqual([
      { number: 1, name: '1 turas', knockout: false },
      { number: 2, name: '2 turas', knockout: true },
    ]);
    expect(page.games).toEqual([
      {
        game: 7,
        round: 1,
        tipOff: at('2026-10-02T18:00:00Z'),
        home: 'Zalgiris',
        away: 'Olympiacos',
        result: { home: 88, away: 79 },
        postponed: false,
        open: true,
      },
      {
        game: 10,
        round: 1,
        tipOff: at('2026-10-20T18:00:00Z'),
        home: 'Real',
        away: 'Olympiacos',
        result: null,
        postponed: false,
        open: false,
      },
    ]);
  });

  it("results page: every game of the tournament (R-66); a postponed game's boxes take input (decision 10)", async () => {
    const page = await loadResultsPage(db, {
      tournament: TOURNAMENT,
      round: 'all',
      now: NOW,
      rules: ruledRules,
    });
    expect(page.games.map((line) => line.game)).toEqual([7, 8, 9, 10]);
    expect(page.games.find((line) => line.game === 9)).toMatchObject({
      postponed: true,
      open: true,
      result: null,
    });
  });

  it('results page: no current round lists nothing', async () => {
    const page = await loadResultsPage(db, {
      tournament: TOURNAMENT,
      round: null,
      now: NOW,
      rules: ruledRules,
    });
    expect(page.games).toEqual([]);
  });
});
