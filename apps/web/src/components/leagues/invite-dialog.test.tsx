import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerCard } from '../../../tests/support/league-views';
import { InviteDialog } from './invite-dialog';

// index.blade.php's invite modal: the league, the search, the people.

const card = ownerCard();
const people = card.people ?? { members: [], pending: [] };

const dialog = () =>
  render(
    <InviteDialog
      league={{ id: 7, name: 'Draugų lyga' }}
      people={people}
      close={() => undefined}
    />,
  );

const answering = (body: unknown) =>
  vi.fn(() => Promise.resolve(Response.json(body)));

/** Types into the search box and lets the pause and the answer pass. */
async function type(text: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Ieškoti vartotojo...'), {
    target: { value: text },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the invite dialog', () => {
  it('names the league and lists the members with their Admin badge and those who have not answered', () => {
    dialog();
    expect(screen.getByText('Draugų lyga')).toBeTruthy();
    expect(screen.getByText('Nariai')).toBeTruthy();
    expect(screen.getByText('Jonas Jonaitis')).toBeTruthy();
    expect(screen.getAllByText('Admin')).toHaveLength(1);
    expect(screen.getByText('Petras Petraitis')).toBeTruthy();
    expect(screen.getByText('Laukiama atsakymo')).toBeTruthy();
    expect(screen.getByText('Ona Onaitė')).toBeTruthy();
  });

  it('draws no empty pending section', () => {
    render(
      <InviteDialog
        league={{ id: 7, name: 'Draugų lyga' }}
        people={{ ...people, pending: [] }}
        close={() => undefined}
      />,
    );
    expect(screen.queryByText('Laukiama atsakymo')).toBeNull();
  });

  it('asks nothing under two characters', async () => {
    const ask = answering([]);
    vi.stubGlobal('fetch', ask);
    dialog();
    await type('s');
    expect(ask).not.toHaveBeenCalled();
    expect(screen.queryByText('Nerasta')).toBeNull();
  });

  it('asks /leagues/searchUsers for the league and the query after a pause, and lists who was found', async () => {
    const ask = answering([
      { id: '4', username: 'sarunas', name: 'Šarūnas', surname: 'Jas' },
    ]);
    vi.stubGlobal('fetch', ask);
    dialog();
    await type('saru');
    expect(ask).toHaveBeenCalledWith(
      '/leagues/searchUsers?query=saru&leagueID=7',
    );
    expect(screen.getByText('Šarūnas Jas')).toBeTruthy();
    expect(screen.getByText('sarunas')).toBeTruthy();
  });

  it("a pick posts the invite: the league and the found player's id as invitedUserID", async () => {
    vi.stubGlobal(
      'fetch',
      answering([{ id: '4', username: 'sarunas', name: 'Š', surname: 'J' }]),
    );
    dialog();
    await type('saru');
    const pick = screen.getByRole('button', { name: /Š J/u });
    const form = pick.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/leagues/invite');
    expect(
      form?.querySelector<HTMLInputElement>('[name="leagueID"]')?.value,
    ).toBe('7');
    expect(pick.getAttribute('name')).toBe('invitedUserID');
    expect(pick.getAttribute('value')).toBe('4');
  });

  it('says Nerasta when no one is found', async () => {
    vi.stubGlobal('fetch', answering([]));
    dialog();
    await type('zzz');
    expect(screen.getByText('Nerasta')).toBeTruthy();
  });

  it.each([
    ['a refusal', { message: 'Per daug bandymų.' }],
    ['a list of something else', [{ id: 4 }]],
  ])('shows nothing for %s', async (_name, body) => {
    vi.stubGlobal('fetch', answering(body));
    dialog();
    await type('saru');
    expect(screen.queryByText('Nerasta')).toBeNull();
  });

  it('shows nothing when the search fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    dialog();
    await type('saru');
    expect(screen.queryByText('Nerasta')).toBeNull();
  });

  it('never shows the answer to an earlier query, and clearing the box clears the results', async () => {
    vi.stubGlobal('fetch', answering([]));
    dialog();
    await type('saru');
    expect(screen.getByText('Nerasta')).toBeTruthy();
    await type('s');
    expect(screen.queryByText('Nerasta')).toBeNull();
  });
});
