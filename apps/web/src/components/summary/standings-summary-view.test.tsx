import { fireEvent, render, screen, within } from '@testing-library/react';
import { nth } from '../../../tests/support/found';
import { describe, expect, it } from 'vitest';
import {
  badge,
  column,
  JONAS,
  standingsCell,
  standingsData,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { StandingsSummaryView } from './standings-summary-view';

const COLUMNS = [column(JONAS, 'jonas'), column(ZUKAUSKAS, 'žuk')];

const pointed = standingsCell({
  place: badge('1', 'hit', { pointsTenths: 100, base: null, multiplier: null }),
  playOffs: badge('✓', 'hit', {
    pointsTenths: 200,
    base: '10.0',
    multiplier: '2.00',
  }),
  finalFour: badge('✗', 'miss', null),
  final: badge('2', 'partial', null),
  totalTenths: 300,
  totalLines: [
    { stage: 'place', pointsTenths: 100, base: null, multiplier: null },
    { stage: 'playOffs', pointsTenths: 200, base: '10.0', multiplier: '2.00' },
  ],
});

const view = () =>
  render(
    <StandingsSummaryView
      data={standingsData(COLUMNS, [
        [
          1,
          'Olympiacos',
          [
            [JONAS, pointed],
            [ZUKAUSKAS, standingsCell()],
          ],
        ],
        [2, 'Zalgiris', [[JONAS, standingsCell()]]],
      ])}
    />,
  );

describe('StandingsSummaryView (summary/standings.blade.php)', () => {
  it('the legend, then a table headed "Komanda" with a column per player', () => {
    view();
    expect(screen.getByTestId('sst-legend')).toBeDefined();
    expect(
      screen.getAllByRole('columnheader').map((head) => head.textContent),
    ).toEqual(['Komanda', 'jonas', 'žuk']);
  });

  it('a row per team: its crest and name', () => {
    view();
    const rows = screen.getAllByTestId('sst-team-row');
    expect(rows).toHaveLength(2);
    const first = nth(rows, 0);
    expect(
      within(first).getByRole('img', { name: 'Olympiacos' }),
    ).toBeDefined();
    expect(within(first).getByText('Olympiacos')).toBeDefined();
  });

  it('a cell: the four badges in order, place, 1/4, 1/2, final', () => {
    view();
    const cell = nth(screen.getAllByTestId('sst-cell'), 0);
    const badges = within(cell).getAllByTestId('sst-badge');
    expect(
      badges.map((each) => [
        each.getAttribute('data-stage'),
        each.textContent,
        each.getAttribute('data-verdict'),
      ]),
    ).toEqual([
      ['place', '1', 'hit'],
      ['playOffs', '✓', 'hit'],
      ['finalFour', '✗', 'miss'],
      ['final', '2', 'partial'],
    ]);
  });

  it('the cell total is shown above 0, one decimal, with a popover of the stages; blank at 0', () => {
    view();
    const cells = screen.getAllByTestId('sst-cell');
    const total = within(nth(cells, 0)).getByTestId('sst-total');
    expect(total.textContent).toBe('30.0');
    fireEvent.mouseEnter(total);
    expect(
      Array.from(
        screen.getByRole('tooltip').querySelectorAll('div > div'),
        (row) => row.textContent,
      ),
    ).toEqual([
      'Reguliarus sezonas10.0',
      'Atkrintamosios20.0',
      'Spėjimo taškai10.0',
      'Koeficientas×2.00',
    ]);
    expect(within(nth(cells, 1)).queryByTestId('sst-total')).toBeNull();
  });

  it('a player with no row for a team has an empty cell', () => {
    view();
    const second = nth(screen.getAllByTestId('sst-team-row'), 1);
    const cells = within(second).getAllByTestId('sst-cell');
    expect(cells[1]?.textContent).toBe('');
    expect(cells[0]?.textContent).toContain('3');
  });
});
