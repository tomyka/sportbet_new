import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { must } from '../../../tests/support/found';
import {
  leagueCard,
  letsThrough,
  ownerCard,
} from '../../../tests/support/league-views';
import { CreateLeague, EditLeagueDialog } from './league-form-dialog';

// The create and edit modals of index.blade.php; the boxes carry the names
// LeagueController reads and the limits the domain checks (R-121).

afterEach(() => {
  vi.restoreAllMocks();
});

const field = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLInputElement>(`[name="${name}"]`);

describe('CreateLeague', () => {
  it('opens "Sukurti naują lygą" from the button and shuts it with Atšaukti', () => {
    render(<CreateLeague />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti lygą' }));
    expect(
      screen.getByRole('dialog', { name: 'Sukurti naują lygą' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atšaukti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a plain form to /leagues/create with the four boxes, empty, and limits', () => {
    render(<CreateLeague />);
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti lygą' }));
    const dialog = screen.getByRole('dialog');
    const form = dialog.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/leagues/create');
    const name = field(dialog, 'name');
    expect(name?.value).toBe('');
    expect(name?.required).toBe(true);
    expect(name?.maxLength).toBe(100);
    expect(field(dialog, 'description')?.maxLength).toBe(500);
    expect(field(dialog, 'base_fee')?.min).toBe('0');
    expect(field(dialog, 'penalty_step')?.min).toBe('0');
    expect(dialog.querySelector('[name="leagueID"]')).toBeNull();
    expect(screen.getByText('Dalyvio mokestis (€)')).toBeTruthy();
    expect(screen.getByText('Papildomas mokestis už vietą (€)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sukurti' })).toBeTruthy();
  });
});

describe('EditLeagueDialog', () => {
  const edit = (card = ownerCard({ baseFee: 10, penaltyStep: 0 })) =>
    render(<EditLeagueDialog league={card} close={() => undefined} />);

  it('is a plain form to /leagues/update that names the league and starts from its values', () => {
    edit(ownerCard({ description: 'Aprašas', baseFee: 10, penaltyStep: 0 }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('form')?.getAttribute('action')).toBe(
      '/leagues/update',
    );
    expect(field(dialog, 'leagueID')?.value).toBe('7');
    expect(field(dialog, 'name')?.value).toBe('Draugų lyga');
    expect(field(dialog, 'description')?.value).toBe('Aprašas');
    expect(field(dialog, 'base_fee')?.value).toBe('10');
    expect(field(dialog, 'penalty_step')?.value).toBe('0');
    expect(screen.getByRole('button', { name: 'Išsaugoti' })).toBeTruthy();
  });

  it('starts a league with no fees and no description from blank boxes', () => {
    edit(ownerCard());
    const dialog = screen.getByRole('dialog');
    expect(field(dialog, 'description')?.value).toBe('');
    expect(field(dialog, 'base_fee')?.value).toBe('');
    expect(field(dialog, 'penalty_step')?.value).toBe('');
  });

  it("the owner's dialog offers Ištrinti lygą, which posts leagueID to /leagues/delete after the confirmation", () => {
    edit();
    const button = screen.getByRole('button', { name: 'Ištrinti lygą' });
    const form = document.getElementById(button.getAttribute('form') ?? '');
    expect(form?.getAttribute('action')).toBe('/leagues/delete');
    expect(form?.getAttribute('method')).toBe('post');
    expect(field(must(form), 'leagueID')?.value).toBe('7');
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(letsThrough('click', () => fireEvent.click(button))).toBe(false);
    expect(ask).toHaveBeenCalledWith(
      'Ištrinti lygą "Draugų lyga"? Visi nariai bus pašalinti. Šis veiksmas negrįžtamas.',
    );
    ask.mockReturnValue(true);
    expect(letsThrough('click', () => fireEvent.click(button))).toBe(true);
  });

  it("a former owner's dialog (an admin who is not the owner) has no delete", () => {
    edit(
      leagueCard({
        may: {
          switch: true,
          invite: true,
          edit: true,
          delete: false,
          leave: true,
        },
      }),
    );
    expect(screen.queryByRole('button', { name: 'Ištrinti lygą' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Išsaugoti' })).toBeTruthy();
  });
});
