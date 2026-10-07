import type { SingleGame } from '@sportbet/db';
import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { EL_2026 } from '../../../tests/support/hub-cards';
import { singleGameText } from './single-game-text';

const SINGLE: SingleGame = {
  tournament: EL_2026,
  home: 'Zalgiris Kaunas',
  away: 'Real Madrid',
  tipOff: at('2027-03-04T18:00:00Z'),
  locked: false,
  prediction: { home: null, away: null },
};

describe('singleGameText (showSingleGame, as the page prints it)', () => {
  it('the teams, the tip-off in Vilnius, a blank row as empty boxes', () => {
    expect(singleGameText(SINGLE, 9001)).toEqual({
      game: 9001,
      home: 'Zalgiris Kaunas',
      away: 'Real Madrid',
      stamp: '2027-03-04 20:00',
      locked: false,
      prediction: { home: '', away: '' },
    });
  });

  it("the player's scores as typed, and no row as none", () => {
    expect(
      singleGameText({ ...SINGLE, prediction: { home: 85, away: 80 } }, 9001)
        .prediction,
    ).toEqual({ home: '85', away: '80' });
    expect(
      singleGameText({ ...SINGLE, prediction: null }, 9001).prediction,
    ).toBeNull();
  });
});
