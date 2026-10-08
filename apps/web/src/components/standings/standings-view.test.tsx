import type { LadderRow, StandingsPage } from '@sportbet/domain';
import { at, team } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StandingsView } from './standings-view';

const row = (id: number, name: string): LadderRow => ({
  team: team(String(id)),
  name,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
});

const page = (closes: StandingsPage['closes']): StandingsPage => ({
  rows: [row(1, 'Olympiacos'), row(2, 'Zalgiris')],
  placesSaved: false,
  counts: { places: 0, playOffs: 0, finalFour: 0, finalPlaces: 0 },
  totals: { places: 2, playOffs: 8, finalFour: 4, finalPlaces: 2 },
  closes,
});

describe('StandingsView (standings.blade.php)', () => {
  it('R-80: while open, when the predictions close, in Vilnius time', () => {
    render(
      <StandingsView
        page={page({ state: 'open', at: at('2026-10-06T18:00:00Z') })}
      />,
    );
    expect(
      screen.getByText('Prognozės užsidaro spalio 6 d., 21:00.'),
    ).toBeDefined();
  });

  it('R-80: once closed, "Prognozės uždarytos."', () => {
    render(<StandingsView page={page({ state: 'closed' })} />);
    expect(screen.getByText('Prognozės uždarytos.')).toBeDefined();
    expect(screen.queryByText(/Prognozės užsidaro/u)).toBeNull();
  });

  it('R-80: nothing for a tournament with no deadline game', () => {
    render(<StandingsView page={page({ state: 'never' })} />);
    expect(screen.queryByText(/Prognozės užsidaro/u)).toBeNull();
    expect(screen.queryByText('Prognozės uždarytos.')).toBeNull();
  });

  it("the ladder's card, then sportbet's legend for the Euroleague", () => {
    render(<StandingsView page={page({ state: 'never' })} />);
    expect(screen.getByText('Lentelė')).toBeDefined();
    expect(screen.getAllByTestId('ladder-row')).toHaveLength(2);
    const legend = screen.getByTestId('standings-legend').textContent;
    expect(legend).toContain(
      'Vieta - tempkite eilutes arba naudokite rodykles; vieta lentelėje yra eilės numeris.',
    );
    expect(legend).toContain(
      '1/4 - 1/2 - pažymėkite komandas, patenkančias į kiekvieną etapą.',
    );
    expect(legend).toContain('F - 1 - čempionas, 2 - vicečempionas.');
  });
});
