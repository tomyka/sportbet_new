import { team } from '@sportbet/domain/testing';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubScrolling } from '../../../tests/support/scroll';
import {
  summaryData,
  summaryRow,
  tile,
} from '../../../tests/support/survival-views';
import { SurvivalSummaryView } from './survival-summary-view';

beforeEach(() => {
  stubScrolling();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rows = () => screen.getAllByTestId('survival-row');

const tilesOf = (row: HTMLElement) =>
  within(row).getAllByTestId('survival-tile');

describe('SurvivalSummaryView (summary/survivals.blade.php)', () => {
  it('the header: "Išlikimas", "Kiekvienas langelis - vieno turo pasirinkimas"', () => {
    render(
      <SurvivalSummaryView data={summaryData([summaryRow('1', 'jonas')])} />,
    );
    expect(screen.getByRole('heading', { name: 'Išlikimas' })).toBeDefined();
    expect(
      screen.getByText('Kiekvienas langelis - vieno turo pasirinkimas'),
    ).toBeDefined();
  });

  it('the legend: the four tiles, drawn as the board draws them', () => {
    render(
      <SurvivalSummaryView data={summaryData([summaryRow('1', 'jonas')])} />,
    );
    const legend = screen.getByTestId('survival-legend');
    expect(
      within(legend)
        .getAllByTestId('survival-legend-item')
        .map((item) => [
          item.textContent,
          item.querySelector('[data-state]')?.getAttribute('data-state'),
        ]),
    ).toEqual([
      ['Išliko', 'hit'],
      ['Iškrito', 'miss'],
      ['Pasirinkta, dar nežinoma', 'pending'],
      ['Nepasirinkta', 'none'],
    ]);
  });

  it('each tile: its state, its crest when a team is known, and its title', () => {
    render(
      <SurvivalSummaryView
        data={summaryData(
          [
            summaryRow('1', 'jonas', {
              tiles: [
                tile(1, 'hit', { team: team('1'), points: 10 }),
                tile(2, 'miss', { team: team('2'), points: 0 }),
                tile(3, 'pending', { team: team('3') }),
                tile(4, 'none'),
              ],
            }),
          ],
          [1, 2, 3, 4],
        )}
      />,
    );
    const tiles = tilesOf(rows()[0] ?? document.body);
    expect(
      tiles.map((each) => [
        each.getAttribute('data-state'),
        each.getAttribute('title'),
      ]),
    ).toEqual([
      ['hit', 'Pirmas turas · Olympiacos · 10'],
      ['miss', '2 turas · Zalgiris · 0'],
      ['pending', '3 turas · Real Madrid · dar nežinoma'],
      ['none', '4 turas · nepasirinkta'],
    ]);
    expect(
      within(tiles[0] ?? document.body).getByRole('img', {
        name: 'Olympiacos',
      }),
    ).toBeDefined();
    expect(within(tiles[3] ?? document.body).queryByRole('img')).toBeNull();
  });

  it('R-82: a hidden pick reads "Pasirinkta", with no crest', () => {
    render(
      <SurvivalSummaryView
        data={summaryData([
          summaryRow('2', 'petras', {
            tiles: [tile(1, 'pending', { hidden: true }), tile(2, 'none')],
          }),
        ])}
      />,
    );
    const hidden = tilesOf(rows()[0] ?? document.body)[0];
    expect(hidden?.getAttribute('title')).toBe(
      'Pirmas turas · Pasirinkta · dar nežinoma',
    );
    expect(hidden?.querySelector('img')).toBeNull();
  });

  it('a row: rank, initials, username, "Iš eilės" and "taškų"; the first rank marked', () => {
    render(
      <SurvivalSummaryView
        data={summaryData([
          summaryRow('1', 'jonas', {
            rank: 1,
            initials: 'JJ',
            streak: 2,
            total: 22,
          }),
          summaryRow('2', 'petras', { rank: 2 }),
        ])}
      />,
    );
    const [first, second] = rows();
    const row = within(first ?? document.body);
    expect(row.getByTestId('survival-rank').textContent).toBe('1');
    expect(row.getByTestId('survival-rank').getAttribute('data-top')).toBe(
      'true',
    );
    expect(row.getByTestId('survival-avatar').textContent).toBe('JJ');
    expect(row.getByText('jonas')).toBeDefined();
    expect(row.getByTestId('survival-streak').textContent).toBe('2Iš eilės');
    expect(row.getByTestId('survival-total').textContent).toBe('22taškų');
    expect(
      within(second ?? document.body)
        .getByTestId('survival-rank')
        .getAttribute('data-top'),
    ).toBe('false');
  });

  it('R-83: a total a pending pick may still change reads "~22"', () => {
    render(
      <SurvivalSummaryView
        data={summaryData([
          summaryRow('1', 'jonas', { total: 22, provisional: true }),
        ])}
      />,
    );
    expect(screen.getByTestId('survival-total').textContent).toBe('~22taškų');
  });

  it("the viewer's row is marked", () => {
    render(
      <SurvivalSummaryView
        data={summaryData([
          summaryRow('1', 'jonas'),
          summaryRow('2', 'petras', { me: true }),
        ])}
      />,
    );
    expect(rows().map((row) => row.getAttribute('data-me'))).toEqual([
      'false',
      'true',
    ]);
  });

  it('no rounds, or no players: "Išlikimo turų šiame turnyre dar nėra."', () => {
    const { unmount } = render(
      <SurvivalSummaryView
        data={summaryData([summaryRow('1', 'jonas')], [])}
      />,
    );
    expect(
      screen.getByText('Išlikimo turų šiame turnyre dar nėra.'),
    ).toBeDefined();
    expect(screen.queryByTestId('survival-legend')).toBeNull();
    unmount();
    render(<SurvivalSummaryView data={summaryData([])} />);
    expect(
      screen.getByText('Išlikimo turų šiame turnyre dar nėra.'),
    ).toBeDefined();
  });
});
