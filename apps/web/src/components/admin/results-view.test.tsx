import { render, screen, within } from '@testing-library/react';
import { at, gameNo, roundNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { ResultsView } from './results-view';

const PAGE = {
  rounds: [
    { number: roundNo(1), name: '1 turas', knockout: false },
    { number: roundNo(2), name: 'Atkrintamosios', knockout: true },
  ],
  games: [
    {
      game: gameNo(7),
      round: roundNo(1),
      tipOff: at('2026-10-02T18:00:00Z'),
      home: 'Zalgiris',
      away: 'Olympiacos',
      result: { home: 88, away: 79 },
      postponed: false,
      open: true,
    },
    {
      game: gameNo(9),
      round: roundNo(2),
      tipOff: at('2026-10-10T17:30:00Z'),
      home: 'Real',
      away: 'Fenerbahce',
      result: null,
      postponed: true,
      open: true,
    },
    {
      game: gameNo(11),
      round: roundNo(2),
      tipOff: at('2026-10-20T18:00:00Z'),
      home: 'Zalgiris',
      away: 'Real',
      result: null,
      postponed: false,
      open: false,
    },
  ],
};

describe('ResultsView (admin/results.blade.php)', () => {
  it('results: a round per header, "Rungtynės" or Vilnius days, the finished round collapsed', () => {
    render(<ResultsView page={PAGE} flash={null} />);
    const first = screen.getByText('1 turas').closest('details');
    expect(first?.open).toBe(false);
    expect(within(first ?? document.body).getByText('Rungtynės')).toBeTruthy();
    const second = screen.getByText('Atkrintamosios').closest('details');
    expect(second?.open).toBe(true);
    expect(within(second ?? document.body).getByText('Spalio 10')).toBeTruthy();
    expect(within(second ?? document.body).getByText('Spalio 20')).toBeTruthy();
  });

  it("results: each game's names, Vilnius time, and boxes - a scored game's result, a postponed game's -1 : -1 and \"Atidėta\", a future game's boxes disabled", () => {
    render(<ResultsView page={PAGE} flash={null} />);
    expect(screen.getByText('Spalio 2 · 21:00')).toBeTruthy();
    const [home7, away7] = screen.getAllByRole('textbox', {
      name: /Zalgiris - Olympiacos/u,
    });
    expect(home7?.getAttribute('value')).toBe('88');
    expect(away7?.getAttribute('value')).toBe('79');
    expect(screen.getByText('Atidėta')).toBeTruthy();
    const [home9] = screen.getAllByRole('textbox', {
      name: /Real - Fenerbahce/u,
    });
    expect(home9?.getAttribute('value')).toBe('-1');
    expect(home9?.hasAttribute('disabled')).toBe(false);
    const [home11] = screen.getAllByRole('textbox', {
      name: /Zalgiris - Real/u,
    });
    expect(home11?.hasAttribute('disabled')).toBe(true);
  });

  it('results: no games, no rounds drawn', () => {
    render(
      <ResultsView page={{ rounds: PAGE.rounds, games: [] }} flash={null} />,
    );
    expect(screen.queryByText('1 turas')).toBeNull();
  });
});
