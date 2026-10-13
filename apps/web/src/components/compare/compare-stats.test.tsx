import { render, screen } from '@testing-library/react';
import { must } from '../../../tests/support/found';
import { describe, expect, it } from 'vitest';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { CompareStats } from './compare-stats';

const stats = (
  me: Parameters<typeof side>[2],
  them: Parameters<typeof side>[2],
) =>
  render(
    <CompareStats
      comparison={comparison(
        side(JONAS, 'jonas', me),
        side(ZUKAUSKAS, 'zuk', them),
      )}
    />,
  );

const rowOf = (label: string) =>
  must(
    screen
      .getAllByTestId('compare-stat')
      .find((row) => row.textContent.includes(label)),
  );

const cellsOf = (label: string) =>
  Array.from(rowOf(label).children, (cell) => [
    cell.textContent,
    /text-(?:accent|muted)/u.exec(cell.className)?.[0],
  ]);

describe('CompareStats ("Bendri statistikos")', () => {
  it('the title and a header row of the two usernames', () => {
    stats({}, {});
    expect(screen.getByText('Bendri statistikos')).toBeDefined();
    expect(screen.getByTestId('compare-stats-header').textContent).toBe(
      'jonaszuk',
    );
  });

  it('match and standings points and the serija to one decimal, the bingos whole, the larger marked', () => {
    stats(
      {
        matchCents: 4050,
        standingsCents: 1000,
        serijaCents: 250,
        bingo: 3,
      },
      {
        matchCents: 3000,
        standingsCents: 2000,
        serijaCents: 250,
        bingo: 1,
      },
    );
    expect(cellsOf('Rungtynių taškai')).toEqual([
      ['40.5', 'text-accent'],
      ['Rungtynių taškai', 'text-muted'],
      ['30.0', 'text-muted'],
    ]);
    expect(cellsOf('Eigos taškai')).toEqual([
      ['10.0', 'text-muted'],
      ['Eigos taškai', 'text-muted'],
      ['20.0', 'text-accent'],
    ]);
    expect(cellsOf('Serija')).toEqual([
      ['2.5', undefined],
      ['Serija', 'text-muted'],
      ['2.5', undefined],
    ]);
    expect(cellsOf('Bingo')).toEqual([
      ['3', 'text-accent'],
      ['Bingo', 'text-muted'],
      ['1', 'text-muted'],
    ]);
  });

  it('"Išlikimo taškai" is hidden while both sides have none', () => {
    stats({}, {});
    expect(
      screen.getAllByTestId('compare-stat').map((row) => row.textContent),
    ).toEqual([
      '0.0Rungtynių taškai0.0',
      '0.0Eigos taškai0.0',
      '0.0Serija0.0',
      '0Bingo0',
    ]);
  });

  it('"Išlikimo taškai" shows, as whole numbers, once either side has some', () => {
    stats({ survivalCents: 1000 }, { survivalCents: 0 });
    expect(cellsOf('Išlikimo taškai')).toEqual([
      ['10', 'text-accent'],
      ['Išlikimo taškai', 'text-muted'],
      ['0', 'text-muted'],
    ]);
    expect(
      screen
        .getAllByTestId('compare-stat')
        .map((row) => row.children[1]?.textContent),
    ).toEqual([
      'Rungtynių taškai',
      'Eigos taškai',
      'Išlikimo taškai',
      'Serija',
      'Bingo',
    ]);
  });
});
