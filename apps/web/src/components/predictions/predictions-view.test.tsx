import type { PredictionLine } from '@sportbet/db';
import { Points } from '@sportbet/domain';
import { at, gameNo, roundNo, unwrap } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PredictionsView } from './predictions-view';

const points = (hundredths: number) => unwrap(Points.ofHundredths(hundredths));

const line = (overrides: Partial<PredictionLine>): PredictionLine => ({
  game: gameNo(10),
  round: roundNo(1),
  roundName: '1 turas',
  tipOff: at('2026-10-20T18:00:00Z'),
  home: 'Olympiacos',
  away: 'Zalgiris',
  predicted: { home: null, away: null },
  state: 'open',
  result: null,
  points: null,
  panel: { home: points(5000), away: points(15000), draw: points(15000) },
  ...overrides,
});

const ROUNDS = [
  { id: 21, name: '1 turas' },
  { id: 22, name: '2 turas' },
];

describe('PredictionsView (results.blade.php)', () => {
  it('"Nėra rungtynių." with nothing to show, or no tournament', () => {
    render(<PredictionsView page={null} />);
    expect(screen.getByText('Nėra rungtynių.')).toBeDefined();
  });

  it('the round menu only when the tournament has more than one round', () => {
    const { unmount } = render(
      <PredictionsView
        page={{ rounds: ROUNDS, selected: 21, lines: [line({})] }}
      />,
    );
    expect(screen.getByRole('combobox')).toBeDefined();
    unmount();
    render(
      <PredictionsView
        page={{
          rounds: [ROUNDS[0] ?? { id: 21, name: '1 turas' }],
          selected: 21,
          lines: [line({})],
        }}
      />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('a round header, then its Vilnius days, each a card with its games', () => {
    render(
      <PredictionsView
        page={{
          rounds: ROUNDS,
          selected: 'all',
          lines: [
            line({}),
            line({
              game: gameNo(7),
              tipOff: at('2026-10-02T18:00:00Z'),
              state: 'scored',
              result: { home: 88, away: 79 },
              predicted: { home: 85, away: 80 },
              panel: null,
            }),
            line({
              game: gameNo(11),
              round: roundNo(2),
              roundName: '2 turas',
              tipOff: at('2026-10-27T18:00:00Z'),
            }),
          ],
        }}
      />,
    );
    const rounds = screen.getAllByTestId('prediction-round');
    expect(rounds.map((round) => round.firstElementChild?.textContent)).toEqual(
      ['1 turas', '2 turas'],
    );
    const days = screen.getAllByTestId('prediction-day');
    expect(days.map((day) => day.firstElementChild?.textContent)).toEqual([
      'Spalio 2',
      'Spalio 20',
      'Spalio 27',
    ]);
    expect(days[0]?.textContent).toContain('88:79');
    expect(screen.getAllByTestId('prediction-row')).toHaveLength(2);
  });

  it("a scored row's points: the total, its serija, and the breakdown as strings", () => {
    render(
      <PredictionsView
        page={{
          rounds: ROUNDS,
          selected: 21,
          lines: [
            line({
              state: 'scored',
              result: { home: 88, away: 79 },
              predicted: { home: 85, away: 80 },
              panel: null,
              points: {
                winner: points(7950),
                margin: points(4400),
                bingo: points(0),
                serija: points(2000),
                full: points(12350),
              },
            }),
          ],
        }}
      />,
    );
    expect(screen.getByTestId('line-points').textContent).toContain('143.5');
    expect(screen.getByTestId('line-points').textContent).toContain('+20.0');
  });

  it('a scored row worth nothing: 0.0, drawn faint, with no breakdown (upt-empty, $totalPts > 0)', () => {
    render(
      <PredictionsView
        page={{
          rounds: ROUNDS,
          selected: 21,
          lines: [
            line({
              state: 'scored',
              result: { home: 88, away: 79 },
              predicted: { home: 70, away: 90 },
              panel: null,
              points: {
                winner: points(0),
                margin: points(0),
                bingo: points(0),
                serija: points(0),
                full: points(0),
              },
            }),
          ],
        }}
      />,
    );
    const shown = screen.getByTestId('line-points');
    expect(shown.textContent).toBe('0.0');
    expect(shown.className).toContain('text-transparent');
  });
});
