import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoredLine } from './scored-line';

const LINE = {
  game: 7,
  time: '21:00',
  home: 'Zalgiris',
  away: 'Olympiacos',
  result: '88:79',
  predicted: '85:80',
  points: null,
};

describe('ScoredLine (a finished game, as Artimiausios rungtynės draws it)', () => {
  it('the time, both crests, the result and the prediction', () => {
    render(<ScoredLine line={LINE} />);
    const row = screen.getByTestId('scored-line');
    expect(row.textContent).toContain('21:00');
    expect(row.textContent).toContain('88:79');
    expect(row.textContent).toContain('/');
    expect(row.textContent).toContain('85:80');
    expect(screen.getByAltText('Zalgiris')).toBeDefined();
    expect(screen.getByAltText('Olympiacos')).toBeDefined();
  });

  it('team names only from md (d-none d-md-inline)', () => {
    render(<ScoredLine line={LINE} />);
    expect(screen.getByText('Zalgiris').className).toContain('hidden');
    expect(screen.getByText('Zalgiris').className).toContain('md:inline');
  });
});
