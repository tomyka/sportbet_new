import { describe, expect, it } from 'vitest';
import { EUROLEAGUE_STAGE_NAMES } from '../summary/standings-summary';
import { rulesPage } from './rules-page';

const FACTS = { teamCount: 20, deadlineRound: 5, survival: true } as const;

describe('rulesPage', () => {
  const page = rulesPage(FACTS);

  it('the tiles: the winner bonus 50, the margin base 50, serija step 5 (R-106)', () => {
    expect(page.tiles).toMatchObject({
      winnerBonus: 50,
      marginBase: 50,
      serijaStep: 5,
    });
  });

  it("the margin table's tiles are R-138's scoring balance", () => {
    expect(page.tiles).toMatchObject({
      differenceSlope: 2,
      bingo: 100,
      exactMargin: 30,
    });
  });

  it("carries the areas' published figures: five margin examples, five odds examples, three serija rows, the places, the bracket and the finals grid", () => {
    expect(page.marginExamples).toHaveLength(5);
    expect(page.oddsExamples).toHaveLength(5);
    expect(
      page.serijaExamples.map(({ bonusHundredths }) => bonusHundredths),
    ).toEqual([0, 500, 1_000]);
    expect(page.placeExamples).toHaveLength(8);
    expect(page.placesContinue).toBe(true);
    expect(page.placeStep).toBe(10);
    expect(page.bracket.map(({ points }) => points)).toEqual([60, 120]);
    expect(page.finalsGrid).toEqual([
      [36, 27],
      [27, 30],
    ]);
  });

  it('the bracket stages have the names the page marks (R-133 Q2, R-76)', () => {
    expect(
      page.bracket.map(({ stage }) => EUROLEAGUE_STAGE_NAMES[stage]),
    ).toEqual(['Atkrintamosios', 'Finalo ketvertas']);
    expect(EUROLEAGUE_STAGE_NAMES).toEqual({
      place: 'Reguliarus sezonas',
      playOffs: 'Atkrintamosios',
      finalFour: 'Finalo ketvertas',
      final: 'Finalas',
    });
  });

  it('passes the team count and the deadline round through (R-106, R-128, R-133)', () => {
    expect(page.teamCount).toBe(20);
    expect(page.deadlineRound).toBe(5);
  });

  it('with no tournament leaves the team count and the deadline round out', () => {
    const none = rulesPage(null);
    expect(none.teamCount).toBeNull();
    expect(none.deadlineRound).toBeNull();
  });
});

describe('rulesPage: the scoring balance (R-138)', () => {
  it('50 - 2 x |error|, +30 for the exact difference, +100 Bingo', () => {
    expect(rulesPage(FACTS).tiles).toMatchObject({
      differenceSlope: 2,
      exactMargin: 30,
      bingo: 100,
    });
  });
});

describe('rulesPage: the rates and the switch-off (R-10, R-7)', () => {
  it('shows the distinct rates in stage order x1 / x2 / x3 (R-10)', () => {
    expect(rulesPage(FACTS).tiles.rates).toEqual([1, 2, 3]);
  });

  it('states the missed games after which a player is switched off (R-7, R-32): 20', () => {
    expect(rulesPage(FACTS).switchOffAfterMisses).toBe(20);
  });
});
