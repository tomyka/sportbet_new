import type { AdminGame, AdminGamesPage } from '@sportbet/db';
import { at, gameNo, roundNo, team } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GamesView } from './games-view';
import { FINISHED } from './tournament-fixtures';

const FRESH: AdminGame = {
  id: gameNo(412),
  roundId: 4,
  round: roundNo(5),
  roundName: '5 turas',
  home: team('1'),
  homeName: 'Zalgiris Kaunas',
  away: team('2'),
  awayName: 'Real Madrid',
  tipOff: at('2026-12-01T18:00:00Z'),
  result: null,
  postponed: false,
  realPredictions: 0,
  deletion: null,
};

const PREDICTED: AdminGame = {
  ...FRESH,
  id: gameNo(411),
  homeName: 'Olympiacos',
  awayName: 'Fenerbahce',
  home: team('3'),
  away: team('4'),
  realPredictions: 2,
  deletion: 'has-real-predictions',
};

const PAGE: AdminGamesPage = {
  games: [FRESH, PREDICTED],
  teams: [
    { id: team('1'), name: 'Zalgiris Kaunas' },
    { id: team('2'), name: 'Real Madrid' },
    { id: team('3'), name: 'Olympiacos' },
    { id: team('4'), name: 'Fenerbahce' },
  ],
  rounds: [
    { id: 3, number: roundNo(4), name: '4 turas' },
    { id: 4, number: roundNo(5), name: '5 turas' },
  ],
  latestTipOff: at('2027-03-28T19:30:00Z'),
  lastRoundId: 4,
  finished: false,
};

const TOURNAMENT = FINISHED.tournament;

const view = (page: AdminGamesPage = PAGE) =>
  render(<GamesView tournament={TOURNAMENT} page={page} flash={null} />);

const typeTime = (value: string) => {
  fireEvent.change(screen.getByLabelText('Data ir laikas'), {
    target: { value },
  });
};

describe('GamesView (admin/games.blade.php)', () => {
  it('games: the title with the count, and the tournament the games are of', () => {
    view();
    expect(screen.getByRole('heading', { name: /Žaidimai/ })).toBeTruthy();
    expect(screen.getByTestId('game-count').textContent).toBe('2');
    expect(screen.getByRole('note').textContent).toBe(
      'Turnyras: Euroleague 2025/26',
    );
  });

  it('games: a row each, in the order given - number, Vilnius time, teams, round', () => {
    view();
    const [first, second] = screen.getAllByTestId('game-row');
    expect(first?.textContent).toContain('412');
    expect(first?.textContent).toContain('gruodžio 1 d., 20:00');
    expect(first?.textContent).toContain('Zalgiris Kaunas');
    expect(first?.textContent).toContain('vs');
    expect(first?.textContent).toContain('Real Madrid');
    expect(first?.textContent).toContain('5 turas');
    expect(second?.getAttribute('data-game')).toBe('411');
  });

  it('games: a game with no team name shows a dash', () => {
    view({ ...PAGE, games: [{ ...FRESH, homeName: '', awayName: '' }] });
    expect(screen.getByTestId('game-row').textContent).toContain('-');
  });

  it('games: a game is opened for editing with its button or a double click', () => {
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Redaguoti žaidimą #412' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Redaguoti žaidimą #412' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atšaukti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const [, second] = screen.getAllByTestId('game-row');
    fireEvent.doubleClick(second ?? document.body);
    expect(
      screen.getByRole('dialog', { name: 'Redaguoti žaidimą #411' }),
    ).toBeTruthy();
  });

  it("games: the edit modal is filled with the game's own Vilnius time, teams and round, and posts to updateGame with its id", () => {
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Redaguoti žaidimą #412' }),
    );
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Data ir laikas')).toHaveProperty(
      'value',
      '2026-12-01T20:00',
    );
    expect(dialog.getByLabelText('Šeimininkai')).toHaveProperty('value', '1');
    expect(dialog.getByLabelText('Svečiai')).toHaveProperty('value', '2');
    expect(dialog.getByLabelText('Etapas')).toHaveProperty('value', '4');
    const save = dialog.getByRole('button', { name: 'Išsaugoti' });
    const form = save.closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/updateGame');
    expect(form?.querySelector('input[name="gameID"]')).toHaveProperty(
      'value',
      '412',
    );
    const names = [...(form?.querySelectorAll('select, input') ?? [])].map(
      (box) => box.getAttribute('name'),
    );
    expect(names).toEqual([
      'gameID',
      'gameDateTime',
      'homeTeamID',
      'awayTeamID',
      'eventID',
    ]);
  });

  it("games: both team boxes offer the tournament's teams only, and a dash", () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Naujas' }));
    for (const label of ['Šeimininkai', 'Svečiai']) {
      const options = [
        ...screen.getByLabelText(label).querySelectorAll('option'),
      ].map((option) => option.textContent);
      expect(options).toEqual([
        '-',
        'Zalgiris Kaunas',
        'Real Madrid',
        'Olympiacos',
        'Fenerbahce',
      ]);
    }
  });

  it("games: the insert modal starts at the latest game's time and the last round, posts to insertGame and has no delete", () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Naujas' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Naujas žaidimas' }),
    );
    expect(dialog.getByLabelText('Data ir laikas')).toHaveProperty(
      'value',
      '2027-03-28T22:30',
    );
    expect(dialog.getByLabelText('Etapas')).toHaveProperty('value', '4');
    expect(dialog.getByLabelText('Šeimininkai')).toHaveProperty('value', '');
    const form = dialog
      .getByRole('button', { name: 'Išsaugoti' })
      .closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/insertGame');
    expect(form?.querySelector('input[name="gameID"]')).toBeNull();
    expect(
      dialog.queryByRole('button', { name: 'Ištrinti žaidimą' }),
    ).toBeNull();
  });

  it('games: with no game yet the insert modal starts empty, and a round is chosen by hand', () => {
    view({ ...PAGE, games: [], latestTipOff: null, lastRoundId: null });
    fireEvent.click(screen.getByRole('button', { name: 'Naujas' }));
    expect(screen.getByLabelText('Data ir laikas')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Etapas')).toHaveProperty('value', '');
    expect(screen.getByTestId('utc-preview').textContent).toBe('');
  });

  it('R-91: the UTC time it will save under is shown under the box, as the time is typed', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Naujas' }));
    typeTime('2026-12-01T20:00');
    expect(screen.getByTestId('utc-preview').textContent).toBe(
      'Bus išsaugota: 2026-12-01 18:00 UTC',
    );
    typeTime('2026-07-01T20:00');
    expect(screen.getByTestId('utc-preview').textContent).toBe(
      'Bus išsaugota: 2026-07-01 17:00 UTC',
    );
    typeTime('');
    expect(screen.getByTestId('utc-preview').textContent).toBe('');
  });

  it('R-91: the spring hour and the autumn hour are refused in words, before saving', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Naujas' }));
    typeTime('2027-03-28T03:30');
    expect(screen.getByTestId('utc-preview').textContent).toBe(
      'Šis laikas Vilniuje neegzistuoja (laikrodžio persukimas).',
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    typeTime('2026-10-25T03:30');
    expect(screen.getByTestId('utc-preview').textContent).toBe(
      'Šis laikas Vilniuje dviprasmiškas (laikrodžio persukimas).',
    );
  });

  it('R-89: "Ištrinti žaidimą" only where the game may be deleted, asking for the emailed code through deleteGame', () => {
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Redaguoti žaidimą #412' }),
    );
    const button = screen.getByRole('button', { name: 'Ištrinti žaidimą' });
    const form = document.getElementById(button.getAttribute('form') ?? '');
    expect(form?.getAttribute('action')).toBe('/admin/deleteGame');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.querySelector('input[name="gameID"]')).toHaveProperty(
      'value',
      '412',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Atšaukti' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Redaguoti žaidimą #411' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Ištrinti žaidimą' }),
    ).toBeNull();
  });

  it('R-110: a finished tournament says so and offers nothing to add or change', () => {
    view({ ...PAGE, finished: true });
    expect(
      screen.getByText('Turnyras baigtas - keisti negalima.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Naujas' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Redaguoti žaidimą/ }),
    ).toBeNull();
    const [first] = screen.getAllByTestId('game-row');
    fireEvent.doubleClick(first ?? document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByTestId('game-row')).toHaveLength(2);
  });

  it('games: with no tournament chosen, the warning and no table', () => {
    render(
      <GamesView
        tournament={null}
        page={{ ...PAGE, games: [] }}
        flash={null}
      />,
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras',
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('games: the one-time message is shown above the table', () => {
    render(
      <GamesView
        tournament={TOURNAMENT}
        page={PAGE}
        flash={{ kind: 'admin', message: 'game-added', number: 412 }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Žaidimas #412 pridėtas.',
    );
  });
});
