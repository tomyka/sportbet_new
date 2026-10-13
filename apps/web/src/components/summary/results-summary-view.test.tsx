import { fireEvent, render, screen, within } from '@testing-library/react';
import { must, nth } from '../../../tests/support/found';
import { describe, expect, it } from 'vitest';
import {
  cell,
  column,
  JONAS,
  resultsData,
  scored,
  summaryGame,
  summaryRound,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { ResultsSummaryView } from './results-summary-view';

const COLUMNS = [column(JONAS, 'jonas'), column(ZUKAUSKAS, 'žuk')];

/** Round 3 (open): one scored game and one started, unscored; round 2 folded. */
const data = () =>
  resultsData(
    COLUMNS,
    [
      summaryRound(
        [3, '3 turas'],
        true,
        [
          summaryGame(31, [1, 2], { home: 80, away: 75 }, [
            [
              JONAS,
              cell(
                { home: 80, away: 75 },
                'ok',
                scored(1550, { winnerCents: 1550 }),
              ),
            ],
            [ZUKAUSKAS, cell({ home: 70, away: 75 }, 'fail', scored(0))],
          ]),
          summaryGame(32, [3, 4], null, [
            [JONAS, cell({ home: 1, away: 2 }, 'pending')],
            [ZUKAUSKAS, cell(null, null)],
          ]),
        ],
        [
          [JONAS, 1550],
          [ZUKAUSKAS, 0],
        ],
      ),
      summaryRound([2, '2 turas'], false, [
        summaryGame(21, [2, 3], { home: 60, away: 61 }, []),
      ]),
    ],
    [
      [JONAS, 1550],
      [ZUKAUSKAS, 0],
    ],
  );

const view = (viewer = JONAS) =>
  render(<ResultsSummaryView data={data()} viewer={viewer} />);

const rowOf = (text: string) =>
  must(
    screen.getAllByRole('row').find((row) => row.textContent.includes(text)),
  );

describe('ResultsSummaryView (summary/results.blade.php)', () => {
  it('the sticky first column is headed "Rungtynės", then one column per player: avatar letter, username', () => {
    view();
    const header = screen.getAllByRole('columnheader');
    expect(header.map((each) => each.textContent)).toEqual([
      'Rungtynės',
      'Jjonas',
      'Žžuk',
    ]);
    expect(header[1]?.getAttribute('title')).toBe('jonas');
  });

  it("the viewer's column is marked in the header, the rounds, the games and the footer", () => {
    view(ZUKAUSKAS);
    const marked = document.querySelectorAll('[data-me="true"]');
    expect(marked[0]?.textContent).toBe('Žžuk');
    expect(marked).toHaveLength(1 + 2 + 2 + 1);
  });

  it('a game row: both crests, the result or "-", and "Home · Away"', () => {
    view();
    const scoredRow = rowOf('Olympiacos · Zalgiris');
    expect(
      within(scoredRow).getByRole('img', { name: 'Olympiacos' }),
    ).toBeDefined();
    expect(
      within(scoredRow).getByRole('img', { name: 'Zalgiris' }),
    ).toBeDefined();
    expect(within(scoredRow).getByTestId('sr-result').textContent).toBe(
      '80:75',
    );
    expect(
      within(rowOf('Real Madrid · Fenerbahce')).getByTestId('sr-result')
        .textContent,
    ).toBe('-');
  });

  it('a scored cell: its points, then the score in its verdict badge', () => {
    view();
    const row = rowOf('Olympiacos · Zalgiris');
    const cells = within(row).getAllByTestId('sr-cell');
    expect(within(nth(cells, 0)).getByTestId('sr-points').textContent).toBe(
      '15.5',
    );
    expect(within(nth(cells, 0)).getByTestId('sr-badge').textContent).toBe(
      '80:75',
    );
    expect(within(nth(cells, 1)).getByTestId('sr-points').textContent).toBe(
      '0.0',
    );
  });

  it.each([
    ['ok', 'bg-ok-tint', 'text-ok'],
    ['fail', 'bg-bad-tint', 'text-bad'],
    ['pending', 'bg-surface-2', 'text-muted'],
  ] as const)(
    "the %s verdict wears sportbet's %s and %s tokens",
    (verdict, ground, ink) => {
      render(
        <ResultsSummaryView
          data={resultsData(
            [column(JONAS, 'jonas')],
            [
              summaryRound([1, '1 turas'], true, [
                summaryGame(11, [1, 2], null, [
                  [JONAS, cell({ home: 1, away: 2 }, verdict)],
                ]),
              ]),
            ],
          )}
          viewer={JONAS}
        />,
      );
      const badge = screen.getByTestId('sr-badge');
      expect(badge.getAttribute('data-verdict')).toBe(verdict);
      expect(badge.className).toContain(ground);
      expect(badge.className).toContain(ink);
    },
  );

  it('a started game with no score yet: no points, only the pending badge; a blank prediction draws nothing', () => {
    view();
    const cells = within(rowOf('Real Madrid · Fenerbahce')).getAllByTestId(
      'sr-cell',
    );
    expect(within(nth(cells, 0)).queryByTestId('sr-points')).toBeNull();
    expect(within(nth(cells, 0)).getByTestId('sr-badge').textContent).toBe(
      '1:2',
    );
    expect(cells[1]?.textContent).toBe('');
  });

  it('a player with no prediction row on a game has an empty cell', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: /2 turas/u }));
    const cells = within(rowOf('Zalgiris · Real Madrid')).getAllByTestId(
      'sr-cell',
    );
    expect(cells.map((each) => each.textContent)).toEqual(['', '']);
  });

  it('the round rows carry the sums, blank at 0, and the footer "Viso" the totals, blank at 0', () => {
    view();
    expect(
      screen.getAllByTestId('sr-round-total').map((each) => each.textContent),
    ).toEqual(['15.5', '', '', '']);
    const footer = screen.getByRole('row', { name: /Viso/u });
    expect(
      within(footer)
        .getAllByRole('cell')
        .map((each) => each.textContent),
    ).toEqual(['Viso', '15.5', '']);
  });

  it('rounds come in the order given; a folded round hides its games until its header is clicked', () => {
    view();
    expect(
      screen.getAllByRole('button').map((each) => each.textContent),
    ).toEqual(['3 turas(2)', '2 turas(1)']);
    expect(screen.queryByText('Zalgiris · Real Madrid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /2 turas/u }));
    expect(screen.getByText('Zalgiris · Real Madrid')).toBeDefined();
  });
});
