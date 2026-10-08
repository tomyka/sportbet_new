import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  game,
  gameLine,
  PLAYED_LINE,
  PREDICTED,
} from '../../../tests/support/dashboard';
import { gameRowOf } from './game-row';
import { GamesList } from './games-list';

const rowsOf = (...lines: Parameters<typeof gameRowOf>[0][]) =>
  lines.map(gameRowOf);

const rows = () => screen.getAllByTestId('games-row');

describe('GamesList: partials/games.blade.php\'s "Visos rungtynės"', () => {
  it('game page: the title and "Visi spėjimai" to the predictions page', () => {
    render(<GamesList games={rowsOf(gameLine())} />);
    expect(screen.getByText('Visos rungtynės')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Visi spėjimai' }).getAttribute('href'),
    ).toBe('/prediction/results');
  });

  it('game page: a row is "MMM D", the time, both crests and names, and the prediction with "?" for a blank side', () => {
    render(
      <GamesList
        games={rowsOf(gameLine({ predicted: { home: 81, away: null } }))}
      />,
    );
    const [row] = rows();
    if (row === undefined) throw new Error('no row');
    const inRow = within(row);
    expect(inRow.getByText('Spa 20')).toBeDefined();
    expect(inRow.getByText('21:00')).toBeDefined();
    expect(inRow.getByText('Olympiacos')).toBeDefined();
    expect(inRow.getByText('Zalgiris')).toBeDefined();
    expect(inRow.getByText('81:?')).toBeDefined();
    expect(row.querySelectorAll('img')).toHaveLength(2);
  });

  it('game page: a played row shows the result over the prediction and its points, with the breakdown on hover', () => {
    render(<GamesList games={rowsOf(PLAYED_LINE)} />);
    const row = within(rows()[0] ?? document.body);
    expect(row.getByText('88:79')).toBeDefined();
    expect(row.getByText('85:80')).toBeDefined();
    const total = row.getByTestId('line-points');
    expect(total.textContent).toContain('14.5');
    fireEvent.mouseEnter(total);
    const pop = within(screen.getByRole('tooltip'));
    expect(pop.getByText('Nugalėtojas')).toBeDefined();
    expect(pop.getByText('Serija')).toBeDefined();
  });

  it('game page: a predicted row not yet played offers the odds, each side\'s "+X pt" on hover (R-61)', () => {
    render(<GamesList games={rowsOf(gameLine(PREDICTED))} />);
    fireEvent.mouseEnter(screen.getByLabelText('Koeficientai'));
    const pop = within(screen.getByRole('tooltip'));
    expect(pop.getByText('Olympiacos')).toBeDefined();
    expect(pop.getByText('+50.0 pt')).toBeDefined();
    expect(pop.getByText('Zalgiris')).toBeDefined();
    expect(pop.getByText('+150.0 pt')).toBeDefined();
  });

  it('game page: no odds before a prediction', () => {
    render(<GamesList games={rowsOf(gameLine())} />);
    expect(screen.queryByLabelText('Koeficientai')).toBeNull();
  });

  it("game page: takes no prediction (R-74 amended) - every row, open, started or played, links to its game's own page, and no row has score boxes", () => {
    render(
      <GamesList
        games={rowsOf(
          gameLine(PREDICTED),
          gameLine({ game: game(11), state: 'locked', predict: false }),
          PLAYED_LINE,
        )}
      />,
    );
    const links = rows().map((row) =>
      within(row).getByRole('link').getAttribute('href'),
    );
    expect(links).toEqual([
      '/prediction/game/10',
      '/prediction/game/11',
      '/prediction/game/7',
    ]);
    for (const row of rows()) fireEvent.click(row);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('prediction-row')).toBeNull();
  });
});
