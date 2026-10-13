import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { roundNo } from '@sportbet/domain/testing';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { CompareView } from './compare-view';

const compared = comparison(
  side(JONAS, 'jonas', { totalCents: 1000 }),
  side(ZUKAUSKAS, 'zuk', { totalCents: 500 }),
  {
    record: { wins: 1, draws: 0, losses: 0 },
    rounds: [
      { round: roundNo(1), name: '1 turas', meCents: 1000, themCents: 500 },
    ],
  },
);

describe('CompareView (compare/show.blade.php)', () => {
  it('the header, "Bendri statistikos" and "Etapai", in that order', () => {
    render(<CompareView comparison={compared} />);
    const text = document.body.textContent;
    expect(text.indexOf('jonas')).toBeLessThan(
      text.indexOf('Bendri statistikos'),
    );
    expect(text.indexOf('Bendri statistikos')).toBeLessThan(
      text.indexOf('Etapai'),
    );
  });

  it('"Atgal" goes back to the game page', () => {
    render(<CompareView comparison={compared} />);
    const back = screen.getByRole('link', { name: /Atgal/u });
    expect(back.getAttribute('href')).toBe('/main');
    expect(back.querySelector('[data-icon="arrow-left"]')).not.toBeNull();
  });
});
