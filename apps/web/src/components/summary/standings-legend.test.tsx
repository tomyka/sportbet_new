import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StandingsLegend } from './standings-legend';

describe('StandingsLegend (summary/standings.blade.php)', () => {
  it('names the five verdicts, each beside a sample badge in its colours', () => {
    render(<StandingsLegend />);
    const colours = screen.getByTestId('sst-legend-colors');
    expect(colours.textContent).toBe(
      '2Pataikyta2Praleista2Pusfinalis teisingas, finalo vieta ne2Laukiama2Nespėta',
    );
    expect(
      Array.from(within(colours).getAllByTestId('sst-badge'), (badge) =>
        badge.getAttribute('data-verdict'),
      ),
    ).toEqual(['hit', 'miss', 'partial', 'pending', 'none']);
  });

  it("names Euroleague's stages: G Grupė, QF 1/4, SF 1/2, F Finalas", () => {
    render(<StandingsLegend />);
    expect(screen.getByTestId('sst-legend-stages').textContent).toBe(
      'GGrupėQF1/4SF1/2FFinalas',
    );
  });
});
