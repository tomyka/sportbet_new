import type { AdminMessage, AdminMessages } from '@sportbet/db';
import { storedLeagueMessage } from '@sportbet/domain';
import { leagueNo, unwrap } from '@sportbet/domain/testing';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  hiddenValue,
  inputByLabel,
  selectByLabel,
  switchByName,
} from './element-lookup';
import { MessagesView } from './messages-view';
import { FINISHED } from './tournament-fixtures';

const message = (spec: {
  id: number;
  text: string;
  league: number | null;
  active: boolean;
  leagueName: string | null;
}): AdminMessage => ({
  message: unwrap(
    storedLeagueMessage({
      id: spec.id,
      league: spec.league === null ? null : leagueNo(spec.league),
      text: spec.text,
      active: spec.active,
    }),
  ),
  leagueName: spec.leagueName,
});

const DATA: AdminMessages = {
  messages: [
    message({
      id: 3,
      text: 'Sveiki visi',
      league: 1,
      active: true,
      leagueName: 'Bendra lyga',
    }),
    message({
      id: 4,
      text: 'Našlaitė žinutė',
      league: null,
      active: false,
      leagueName: null,
    }),
  ],
  leagues: [
    { id: leagueNo(1), name: 'Bendra lyga' },
    { id: leagueNo(9), name: 'Draugų lyga' },
  ],
};

const view = (canDelete: boolean, data: AdminMessages = DATA) =>
  render(
    <MessagesView
      data={data}
      tournament={FINISHED.tournament}
      canDelete={canDelete}
      flash={null}
    />,
  );

const rowOf = (id: number): HTMLElement => {
  const row = screen
    .getAllByTestId('message-row')
    .find((each) => each.dataset['message'] === String(id));
  if (row === undefined) throw new Error(`no row ${String(id)}`);
  return row;
};

describe('MessagesView (admin/messages.blade.php, R-95, R-116)', () => {
  it('messages: titles the page with the count and names the tournament, listing the columns', () => {
    view(true);
    expect(screen.getByRole('heading', { name: /Žinutės/ })).toBeTruthy();
    expect(screen.getByTestId('message-count').textContent).toBe('2');
    expect(screen.getByRole('note').textContent).toContain(
      FINISHED.tournament.name,
    );
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['#', 'Žinutė', 'Lygos', 'Aktyvi', '']);
  });

  it('messages: a row is a form posting the message, its text, league and switch to the save route', () => {
    view(true);
    const row = rowOf(3);
    const form = row.closest('form') ?? row.querySelector('form');
    expect(form?.getAttribute('action')).toBe('/admin/messages/save');
    expect(form?.getAttribute('method')).toBe('post');
    expect(hiddenValue(form, 'messageID')).toBe('3');
    const text = inputByLabel(row, 'Žinutė #3');
    expect(text.value).toBe('Sveiki visi');
    expect(text.getAttribute('name')).toBe('message');
    expect(text.getAttribute('maxlength')).toBe('10000');
    const league = selectByLabel(row, 'Lyga');
    expect(league.name).toBe('leagueID');
    expect(league.value).toBe('1');
    expect(
      within(league)
        .getAllByRole('option')
        .map((option) => [option.getAttribute('value'), option.textContent]),
    ).toEqual([
      ['', '- lyga -'],
      ['1', 'Bendra lyga'],
      ['9', 'Draugų lyga'],
    ]);
    const active = switchByName(row, 'Aktyvi');
    expect(active.getAttribute('name')).toBe('active');
    expect(active.checked).toBe(true);
  });

  it('messages: a detached message shows the blank league and an inactive switch', () => {
    view(true);
    const row = rowOf(4);
    expect(selectByLabel(row, 'Lyga').value).toBe('');
    expect(switchByName(row, 'Aktyvi').checked).toBe(false);
  });

  it('messages: Išsaugoti posts update; Ištrinti only for a superadmin, posting delete after asking (R-116)', () => {
    view(true);
    const row = rowOf(3);
    const save = within(row).getByRole('button', { name: 'Išsaugoti' });
    expect([save.getAttribute('name'), save.getAttribute('value')]).toEqual([
      'update',
      '1',
    ]);
    const remove = within(row).getByRole('button', { name: 'Ištrinti' });
    expect([remove.getAttribute('name'), remove.getAttribute('value')]).toEqual(
      ['delete', '1'],
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(fireEvent.click(remove)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Ištrinti žinutę?');
    confirm.mockRestore();
  });

  it('messages: a results manager lists, inserts and edits, and sees no delete button (R-116)', () => {
    view(false);
    expect(screen.queryByRole('button', { name: 'Ištrinti' })).toBeNull();
    expect(
      within(rowOf(3)).getByRole('button', { name: 'Išsaugoti' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pridėti žinutę' })).toBeTruthy();
  });

  it('messages: the insert row posts a new message to messageInsert, with the same league choices', () => {
    view(true);
    const add = screen.getByRole('button', { name: 'Pridėti žinutę' });
    const form = add.closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/messageInsert');
    const box = screen.getByPlaceholderText('Nauja žinutė…');
    expect(box.getAttribute('name')).toBe('message');
    expect(box.getAttribute('maxlength')).toBe('10000');
    const insert = screen.getByTestId('message-insert');
    expect(selectByLabel(insert, 'Lyga').options).toHaveLength(3);
    expect(switchByName(insert, 'Aktyvi')).toBeTruthy();
  });

  it('messages: says so when no tournament is chosen and offers nothing', () => {
    render(
      <MessagesView
        data={{ messages: [], leagues: [] }}
        tournament={null}
        canDelete
        flash={null}
      />,
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Nepasirinktas turnyras.',
    );
    expect(screen.queryByRole('button', { name: 'Pridėti žinutę' })).toBeNull();
  });

  it('messages: shows the one-time message', () => {
    render(
      <MessagesView
        data={DATA}
        tournament={FINISHED.tournament}
        canDelete
        flash={{ kind: 'admin', message: 'nothing-to-save' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Nėra ką išsaugoti: formoje nenurodytas veiksmas.',
    );
  });
});
