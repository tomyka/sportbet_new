import { fireEvent, render, screen, within } from '@testing-library/react';
import { player } from '@sportbet/domain/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { must } from '../../../tests/support/found';
import {
  leagueCard,
  letsThrough,
  ownerCard,
} from '../../../tests/support/league-views';
import { LeagueRow } from './league-row';

// index.blade.php's `.lg-row`: what each card lets the player do.

const VIEWER = player('1');

const row = (card = leagueCard()) =>
  render(<LeagueRow league={card} viewer={VIEWER} />);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a league row', () => {
  it("a plain member's row has the switch and leave buttons, and no invite or edit", () => {
    row();
    expect(screen.getByTitle('Perjungti į šią lygą')).toBeTruthy();
    expect(screen.getByTitle('Palikti lygą')).toBeTruthy();
    expect(screen.queryByTitle('Pakviesti narį')).toBeNull();
    expect(screen.queryByTitle('Redaguoti lygą')).toBeNull();
    expect(screen.queryByTitle('Perduoti valdymą')).toBeNull();
    expect(screen.getByText('Narys')).toBeTruthy();
    expect(screen.queryByText('Savininkas')).toBeNull();
  });

  it("an owner's row has invite, edit and hand-over, the Savininkas badge, and no leave", () => {
    row(ownerCard());
    expect(screen.getByTitle('Pakviesti narį')).toBeTruthy();
    expect(screen.getByTitle('Redaguoti lygą')).toBeTruthy();
    expect(screen.getByTitle('Perduoti valdymą')).toBeTruthy();
    expect(screen.getByText('Savininkas')).toBeTruthy();
    expect(screen.queryByTitle('Palikti lygą')).toBeNull();
  });

  it("a former owner's row (an admin who is not the owner) has invite and edit, and may leave", () => {
    row(
      ownerCard({
        isOwner: false,
        may: {
          switch: true,
          invite: true,
          edit: true,
          delete: false,
          leave: true,
          payments: true,
        },
      }),
    );
    expect(screen.getByTitle('Pakviesti narį')).toBeTruthy();
    expect(screen.getByTitle('Redaguoti lygą')).toBeTruthy();
    expect(screen.getByTitle('Palikti lygą')).toBeTruthy();
    expect(screen.queryByTitle('Perduoti valdymą')).toBeNull();
  });

  it("the selected league's row is marked and has no switch", () => {
    row(
      leagueCard({
        selected: true,
        may: { ...leagueCard().may, switch: false },
      }),
    );
    expect(screen.getByTestId('league-row').dataset['selected']).toBe('true');
    expect(screen.queryByTitle('Perjungti į šią lygą')).toBeNull();
  });

  it('shows the member count and the description when there is one', () => {
    row(leagueCard({ memberCount: 12, description: 'Pirmadienio lyga' }));
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Pirmadienio lyga')).toBeTruthy();
  });

  it('the switch posts leagueID to /leagues/switch', () => {
    row();
    const form = screen.getByTitle('Perjungti į šią lygą').closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/leagues/switch');
    expect(
      form?.querySelector<HTMLInputElement>('[name="leagueID"]')?.value,
    ).toBe('7');
  });

  it('leave posts leagueID to /leagues/leave only after "Palikti lygą <name>?" is confirmed', () => {
    row();
    const form = screen.getByTitle('Palikti lygą').closest('form');
    expect(form?.getAttribute('action')).toBe('/leagues/leave');
    expect(
      form?.querySelector<HTMLInputElement>('[name="leagueID"]')?.value,
    ).toBe('7');
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(letsThrough('submit', () => fireEvent.submit(must(form)))).toBe(
      false,
    );
    expect(ask).toHaveBeenCalledWith('Palikti lygą Draugų lyga?');
    ask.mockReturnValue(true);
    expect(letsThrough('submit', () => fireEvent.submit(must(form)))).toBe(
      true,
    );
  });
});

describe('the dialogs a row opens', () => {
  it('invite opens the invite dialog and Escape shuts it', () => {
    row(ownerCard());
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTitle('Pakviesti narį'));
    expect(screen.getByRole('dialog', { name: 'Pakviesti narį' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("edit opens the league's own boxes, the fees filled in", () => {
    row(ownerCard({ description: 'Aprašas', baseFee: 10, penaltyStep: 2 }));
    fireEvent.click(screen.getByTitle('Redaguoti lygą'));
    const dialog = screen.getByRole('dialog', { name: 'Draugų lyga' });
    const field = (name: string) =>
      dialog.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value;
    expect(field('leagueID')).toBe('7');
    expect(field('name')).toBe('Draugų lyga');
    expect(field('description')).toBe('Aprašas');
    expect(field('base_fee')).toBe('10');
    expect(field('penalty_step')).toBe('2');
  });

  it('hand-over opens the member picker and the close button shuts it', () => {
    row(ownerCard());
    fireEvent.click(screen.getByTitle('Perduoti valdymą'));
    const dialog = screen.getByRole('dialog', { name: 'Perduoti valdymą' });
    expect(
      within(dialog).getByRole('button', { name: 'Perduoti valdymą' }),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Uždaryti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click on the scrim shuts the dialog', () => {
    const { container } = row(ownerCard());
    fireEvent.click(screen.getByTitle('Pakviesti narį'));
    const scrim = container.querySelector('[aria-hidden="true"].fixed');
    fireEvent.click(must(scrim));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe("a league row's Mokėjimai link (R-105)", () => {
  it("an admin's row of a private league links to the league's payments page, between invite and edit", () => {
    row(ownerCard());
    const link = screen.getByTitle('Mokėjimai');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/leagues/7/payments');
    expect(link.getAttribute('aria-label')).toBe('Mokėjimai');
    expect(link.querySelector('[data-icon="cash-coin"]')).not.toBeNull();
    const titles = screen
      .getAllByTitle(/Pakviesti narį|Mokėjimai|Redaguoti lygą/u)
      .map((element) => element.getAttribute('title'));
    expect(titles).toEqual(['Pakviesti narį', 'Mokėjimai', 'Redaguoti lygą']);
  });

  it("a plain member's row, and a card the right is withheld from (the public league's), has none", () => {
    row();
    expect(screen.queryByTitle('Mokėjimai')).toBeNull();
  });

  it("an admin's card of the public league has none", () => {
    row(
      ownerCard({
        isPublic: true,
        may: { ...ownerCard().may, payments: false },
      }),
    );
    expect(screen.queryByTitle('Mokėjimai')).toBeNull();
  });
});
