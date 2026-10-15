import type { AdminLeagueMember, AdminLeagueMembers } from '@sportbet/db';
import type { League } from '@sportbet/domain';
import { at, leagueNo, player, tournamentKey } from '@sportbet/domain/testing';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueMembersView } from './league-members-view';

const LEAGUE: League = {
  id: leagueNo(9),
  tournament: tournamentKey('41'),
  name: 'Draugų lyga',
  description: null,
  kind: { public: false, owner: player('7') },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: null,
};

const member = (
  id: number,
  who: string,
  options: {
    member?: Partial<AdminLeagueMember['member']>;
    isOwner?: boolean;
    fullName?: string;
  } = {},
): AdminLeagueMember => ({
  member: {
    id,
    league: leagueNo(9),
    player: player(String(id)),
    isAdmin: false,
    isGuest: false,
    paid: null,
    joinedAt: at('2026-10-01T09:00:00Z'),
    ...options.member,
  },
  username: who,
  fullName: options.fullName ?? 'Jonas Petraitis',
  isOwner: options.isOwner ?? false,
});

const DATA: AdminLeagueMembers = {
  league: LEAGUE,
  members: [
    member(7, 'savininkas', { member: { isAdmin: true }, isOwner: true }),
    member(8, 'adminas', { member: { isAdmin: true } }),
    member(9, 'zaidejas'),
    member(10, 'svecias', { member: { isGuest: true }, fullName: '' }),
    member(11, 'naujokas', { member: { joinedAt: null } }),
  ],
};

const view = (data: AdminLeagueMembers = DATA) =>
  render(<LeagueMembersView data={data} flash={null} />);

const rowOf = (username: string): HTMLElement => {
  const row = screen
    .getAllByTestId('member-row')
    .find((each) => each.dataset['username'] === username);
  if (row === undefined) throw new Error(`no row for ${username}`);
  return row;
};

describe('LeagueMembersView (R-87, R-105)', () => {
  it('members: titles the page with the league, links back to Lygos and counts the members', () => {
    view();
    expect(
      screen.getByRole('heading', { name: /Nariai · Draugų lyga/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Lygos' }).getAttribute('href'),
    ).toBe('/admin/leagues');
    expect(screen.getByTestId('member-count').textContent).toBe('5');
  });

  it('members: a row shows the username, the full name when there is one and the day they joined, or a dash', () => {
    view();
    const row = rowOf('zaidejas');
    expect(within(row).getByText('Jonas Petraitis')).toBeTruthy();
    expect(within(row).getByText('2026-10-01')).toBeTruthy();
    expect(within(rowOf('svecias')).queryByText('Jonas Petraitis')).toBeNull();
    expect(within(rowOf('naujokas')).getByText('-')).toBeTruthy();
  });

  it('members: names the owner, an admin and a guest, and a plain member nothing', () => {
    view();
    expect(
      within(rowOf('savininkas')).getByText('savininkas', {
        selector: 'span.badge',
      }),
    ).toBeTruthy();
    expect(
      within(rowOf('savininkas')).queryByText('administratorius'),
    ).toBeNull();
    expect(within(rowOf('adminas')).getByText('administratorius')).toBeTruthy();
    expect(
      within(rowOf('svecias')).getByText('svečias', { selector: 'span.badge' }),
    ).toBeTruthy();
    expect(
      within(rowOf('zaidejas')).queryAllByText(
        /savininkas|administratorius|svečias/,
      ),
    ).toHaveLength(0);
  });

  it('members: the Svečias switch posts the league, the account and the mark it would make', () => {
    view();
    const full = within(rowOf('zaidejas')).getByRole('switch', {
      name: 'Svečias',
    });
    expect(full.getAttribute('aria-checked')).toBe('false');
    const form = full.closest('form');
    expect(form?.getAttribute('action')).toBe('/admin/leagues/guest');
    expect(form?.getAttribute('method')).toBe('post');
    const value = (name: string) =>
      form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
    expect([value('leagueID'), value('userID'), value('guest')]).toEqual([
      '9',
      '9',
      '1',
    ]);
    const guest = within(rowOf('svecias')).getByRole('switch', {
      name: 'Svečias',
    });
    expect(guest.getAttribute('aria-checked')).toBe('true');
    expect(
      guest
        .closest('form')
        ?.querySelector<HTMLInputElement>('input[name="guest"]')?.value,
    ).toBe('0');
  });

  it('members: says so for a league with no members, and shows the one-time message', () => {
    const { unmount } = view({ ...DATA, members: [] });
    expect(screen.getByText('Narių nėra')).toBeTruthy();
    unmount();
    render(
      <LeagueMembersView
        data={DATA}
        flash={{ kind: 'admin', message: 'member-guest' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Narys pažymėtas svečiu.',
    );
  });
});
