import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { game, gameLine, PLAYED_LINE } from '../../../tests/support/dashboard';
import { routerSpies } from '../../../tests/support/router';
import { gameRowOf } from './game-row';
import { GamesList } from './games-list';

const rowsOf = (...lines: Parameters<typeof gameRowOf>[0][]) =>
  lines.map(gameRowOf);

const rows = () => screen.getAllByTestId('games-row');

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    render(
      <GamesList
        games={rowsOf(gameLine({ predicted: { home: 81, away: 77 } }))}
      />,
    );
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

  it("game page: a single click on an open row opens its plain score boxes, the predictions page's editor - no window, no save button (R-74)", () => {
    render(
      <GamesList
        games={rowsOf(gameLine({ predicted: { home: 81, away: 77 } }))}
      />,
    );
    expect(screen.queryByLabelText('Olympiacos')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Olympiacos/ }));
    expect(screen.getByLabelText('Olympiacos')).toHaveProperty('value', '81');
    expect(screen.getByLabelText('Zalgiris')).toHaveProperty('value', '77');
    expect(screen.getByTestId('prediction-row').getAttribute('data-game')).toBe(
      '10',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Išsaugoti/ })).toBeNull();
  });

  it("game page: the opened boxes autosave through the predictions page's save, as there (R-59, R-62)", async () => {
    vi.mocked(useRouter).mockReturnValue(routerSpies({ refresh: vi.fn() }));
    const fetch = vi.fn<
      (path: string, init?: RequestInit) => Promise<Response>
    >(async () =>
      Promise.resolve(
        Response.json({
          success: true,
          home_odds: 1,
          draw_odds: 2,
          away_odds: 0,
          panel: { home: '100.0', away: '50.0', draw: '166.0' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    render(<GamesList games={rowsOf(gameLine())} />);
    fireEvent.click(screen.getByRole('button', { name: /Olympiacos/ }));
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Olympiacos'), {
        target: { value: '88' },
      });
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Zalgiris'), {
        target: { value: '79' },
      });
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('/prediction/results/save');
  });

  it('game page: a started or played row does not open', () => {
    render(
      <GamesList
        games={rowsOf(
          gameLine({ game: game(11), state: 'locked', predict: false }),
          PLAYED_LINE,
        )}
      />,
    );
    expect(screen.queryByRole('button', { name: /Olympiacos/ })).toBeNull();
    for (const row of rows()) fireEvent.click(row);
    expect(screen.queryByTestId('prediction-row')).toBeNull();
  });
});
