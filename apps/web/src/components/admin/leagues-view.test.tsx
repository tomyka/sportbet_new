import type { AdminLeagueRow } from '@sportbet/db';
import type { League } from '@sportbet/domain';
import { at, leagueNo, player, tournamentKey } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeaguesView } from './leagues-view';
import { FINISHED } from './tournament-fixtures';

const league = (id: number, overrides: Partial<League> = {}): League => ({
  id: leagueNo(id),
  tournament: tournamentKey('41'),
  name: `Lyga ${String(id)}`,
  description: null,
  kind: { public: false, owner: player('7') },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-30T08:00:00Z'),
  ...overrides,
});

const PUBLIC: AdminLeagueRow = {
  league: league(1, {
    name: 'Bendra lyga',
    description: 'Visiems',
    kind: { public: true },
    createdAt: null,
  }),
  memberCount: 12,
  owner: null,
};

const PRIVATE: AdminLeagueRow = {
  league: league(9, {
    name: 'Draugų lyga',
    fee: { base: 10, penaltyStep: 2, reward: null },
  }),
  memberCount: 3,
  owner: {
    player: player('7'),
    username: 'savininkas',
    fullName: 'Jonas Petraitis',
  },
};

const ORPHAN: AdminLeagueRow = {
  league: league(10, {
    name: 'Našlaitė',
    kind: { public: false, owner: null },
  }),
  memberCount: 1,
  owner: null,
};

const view = (rows: readonly AdminLeagueRow[] = [PUBLIC, PRIVATE, ORPHAN]) =>
  render(
    <LeaguesView rows={rows} tournament={FINISHED.tournament} flash={null} />,
  );

const rowOf = (name: string): HTMLElement => {
  const row = screen
    .getAllByTestId('league-row')
    .find((each) => within(each).queryByText(name) !== null);
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
};

describe('LeaguesView (admin/leagues.blade.php, R-87, R-95, R-118)', () => {
  it('leagues: titles the page with the count and the tournament the leagues are of', () => {
    view();
    expect(screen.getByRole('heading', { name: /Lygos/ })).toBeTruthy();
    expect(screen.getByTestId('league-count').textContent).toBe('3');
    expect(screen.getByRole('note').textContent).toContain(
      FINISHED.tournament.name,
    );
  });

  it('leagues: a row shows its name, Vieša or Privati, the member count and the description', () => {
    view();
    const open = rowOf('Bendra lyga');
    expect(within(open).getByText('Vieša')).toBeTruthy();
    expect(within(open).getByText('12')).toBeTruthy();
    expect(within(open).getByText('Visiems')).toBeTruthy();
    expect(within(rowOf('Draugų lyga')).getByText('Privati')).toBeTruthy();
  });

  it('leagues: the line under the name reads number, owner with full name and date, or "be savininko"', () => {
    view();
    expect(
      within(rowOf('Draugų lyga')).getByTestId('league-meta').textContent,
    ).toBe('#9 · savininkas (Jonas Petraitis) · 2026-09-30');
    expect(
      within(rowOf('Bendra lyga')).getByTestId('league-meta').textContent,
    ).toBe('#1 · be savininko');
    expect(
      within(rowOf('Našlaitė')).getByTestId('league-meta').textContent,
    ).toBe('#10 · be savininko · 2026-09-30');
  });

  it("leagues: Nariai and Mokėjimai link to the league's own pages, the public league's payments included", () => {
    view();
    const open = rowOf('Bendra lyga');
    expect(
      within(open).getByRole('link', { name: 'Nariai' }).getAttribute('href'),
    ).toBe('/admin/leagues/1/members');
    expect(
      within(open)
        .getByRole('link', { name: 'Mokėjimai' })
        .getAttribute('href'),
    ).toBe('/admin/leagues/1/payments');
  });

  it('leagues: Ištrinti is offered for a private league only, asks first and posts to the delete that asks for a code', () => {
    view();
    expect(
      within(rowOf('Bendra lyga')).queryByRole('button', { name: 'Ištrinti' }),
    ).toBeNull();
    const button = within(rowOf('Draugų lyga')).getByRole('button', {
      name: 'Ištrinti',
    });
    const form = button.closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/leagues/delete');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="leagueID"]')?.value,
    ).toBe('9');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(fireEvent.click(button)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Ištrinti lygą "Draugų lyga"?');
    confirm.mockRestore();
  });

  it("leagues: Redaguoti opens the owner's form filled with the league, posting to the admin update, with a note on the public league", () => {
    view();
    fireEvent.click(
      within(rowOf('Draugų lyga')).getByRole('button', { name: 'Redaguoti' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Draugų lyga' });
    const form = dialog.querySelector('form');
    expect(form?.getAttribute('action')).toBe('/admin/leagues/update');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="leagueID"]')?.value,
    ).toBe('9');
    expect(
      within(dialog).getByLabelText('Pavadinimas', { exact: false }),
    ).toHaveProperty('value', 'Draugų lyga');
    expect(within(dialog).getByLabelText('Mokestis')).toHaveProperty(
      'value',
      '10',
    );
    expect(within(dialog).getByLabelText('Baudos žingsnis')).toHaveProperty(
      'value',
      '2',
    );
    expect(
      within(dialog).queryByText(
        'Tai vieša lyga - pakeitimai matomi visiems žaidėjams.',
      ),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Atšaukti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(
      within(rowOf('Bendra lyga')).getByRole('button', { name: 'Redaguoti' }),
    );
    expect(
      screen.getByText('Tai vieša lyga - pakeitimai matomi visiems žaidėjams.'),
    ).toBeTruthy();
  });

  it('leagues: says so when there are none, and when no tournament is chosen', () => {
    const { unmount } = view([]);
    expect(screen.getByText('Nėra lygų')).toBeTruthy();
    unmount();
    render(<LeaguesView rows={[]} tournament={null} flash={null} />);
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras.',
    );
  });

  it('leagues: shows the one-time message', () => {
    render(
      <LeaguesView
        rows={[PRIVATE]}
        tournament={FINISHED.tournament}
        flash={{ kind: 'admin', message: 'league-public' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Viešos lygos ištrinti negalima',
    );
  });
});
