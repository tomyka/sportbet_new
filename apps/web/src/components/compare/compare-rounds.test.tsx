import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { roundNo } from '@sportbet/domain/testing';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { CompareRounds } from './compare-rounds';

const rounds = (
  ...each: readonly (readonly [number, string, number, number])[]
) =>
  render(
    <CompareRounds
      comparison={comparison(side(JONAS, 'jonas'), side(ZUKAUSKAS, 'zuk'), {
        rounds: each.map(([round, name, meCents, themCents]) => ({
          round: roundNo(round),
          name,
          meCents,
          themCents,
        })),
      })}
    />,
  );

const rows = () =>
  screen
    .getAllByTestId('compare-round')
    .map((row) =>
      Array.from(row.children, (cell) => [
        cell.textContent,
        /text-(?:accent|muted)/u.exec(cell.className)?.[0],
      ]),
    );

describe('CompareRounds ("Etapai")', () => {
  it('the title, and a header row: the usernames round "Etapas"', () => {
    rounds([1, '1 turas', 1000, 500]);
    expect(screen.getByText('Etapai')).toBeDefined();
    expect(screen.getByTestId('compare-rounds-header').textContent).toBe(
      'jonasEtapaszuk',
    );
  });

  it('a row per round, to one decimal, the larger side marked and the smaller muted', () => {
    rounds([1, '1 turas', 1050, 500], [2, '2 turas', 200, 340]);
    expect(rows()).toEqual([
      [
        ['10.5', 'text-accent'],
        ['1 turas', 'text-muted'],
        ['5.0', 'text-muted'],
      ],
      [
        ['2.0', 'text-muted'],
        ['2 turas', 'text-muted'],
        ['3.4', 'text-accent'],
      ],
    ]);
  });

  it('a tied round marks neither side', () => {
    rounds([1, '1 turas', 700, 700]);
    expect(rows()).toEqual([
      [
        ['7.0', undefined],
        ['1 turas', 'text-muted'],
        ['7.0', undefined],
      ],
    ]);
  });

  it('with no round the section is not drawn', () => {
    const { container } = rounds();
    expect(container.textContent).toBe('');
  });
});
