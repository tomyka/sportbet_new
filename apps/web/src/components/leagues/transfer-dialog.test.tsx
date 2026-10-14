import { render, screen } from '@testing-library/react';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { ownerCard } from '../../../tests/support/league-views';
import { TransferDialog } from './transfer-dialog';

// R-23, R-119: the owner hands the league to another member.

const people = ownerCard().people ?? { members: [], pending: [] };

const dialog = (members = people.members) =>
  render(
    <TransferDialog
      league={{ id: 7, name: 'Draugų lyga' }}
      people={{ ...people, members }}
      viewer={player('1')}
      close={() => undefined}
    />,
  );

describe('the hand-over dialog', () => {
  it('is a plain form to /leagues/transfer posting the league and the picked member', () => {
    dialog();
    const form = screen.getByRole('dialog').querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/leagues/transfer');
    expect(
      form?.querySelector<HTMLInputElement>('[name="leagueID"]')?.value,
    ).toBe('7');
    expect(
      screen.getByRole('combobox', { name: 'Narys' }).getAttribute('name'),
    ).toBe('memberID');
  });

  it('offers the members other than the viewer, each by their player id', () => {
    dialog();
    const options = screen.getAllByRole('option');
    expect(
      options.map((option) => [
        option.getAttribute('value'),
        option.textContent,
      ]),
    ).toEqual([['2', 'Petras Petraitis (petras)']]);
  });

  it('has nobody to hand it to when the owner is the only member, and cannot submit', () => {
    dialog(people.members.slice(0, 1));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Perduoti valdymą',
      }).disabled,
    ).toBe(true);
  });
});
