import type { ResultsPageGame } from '@sportbet/db';
import { at, gameNo, roundNo } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { boxesOf, ResultRow } from './result-row';

const GAME: ResultsPageGame = {
  game: gameNo(7),
  round: roundNo(1),
  tipOff: at('2026-10-02T18:00:00Z'),
  home: 'Zalgiris',
  away: 'Olympiacos',
  result: null,
  postponed: false,
  open: true,
};

describe('ResultRow (.admin-result-row)', () => {
  it("boxes: a result's sides, a postponed game's -1 : -1 (R-63), else empty", () => {
    expect(boxesOf({ ...GAME, result: { home: 88, away: 79 } })).toEqual({
      home: '88',
      away: '79',
    });
    expect(boxesOf({ ...GAME, postponed: true })).toEqual({
      home: '-1',
      away: '-1',
    });
    expect(boxesOf(GAME)).toEqual({ home: '', away: '' });
  });

  it('the teams with their crests, the Vilnius day and time over the boxes', () => {
    render(<ResultRow game={GAME} />);
    expect(screen.getByAltText('Zalgiris')).toBeTruthy();
    expect(screen.getByAltText('Olympiacos')).toBeTruthy();
    expect(screen.getByText('Spalio 2 · 21:00')).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });
});
