import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { nth } from '../../../tests/support/found';
import { InviteList } from './invite-list';

// index.blade.php's "Kvietimai": accept and decline post the invite's id.

const invites = [
  { id: 3, leagueName: 'Kitų lyga', invitedBy: 'petras' },
  { id: 5, leagueName: 'Dar viena', invitedBy: '-' },
];

describe('InviteList', () => {
  it('draws nothing for no invites', () => {
    const { container } = render(<InviteList invites={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('names each league and who invited, a lost inviter as "-"', () => {
    render(<InviteList invites={invites} />);
    const rows = screen.getAllByTestId('invite-row');
    const first = nth(rows, 0);
    const second = nth(rows, 1);
    expect(within(first).getByText('Kitų lyga')).toBeTruthy();
    expect(within(first).getByText('pakvietė petras')).toBeTruthy();
    expect(within(second).getByText('pakvietė -')).toBeTruthy();
  });

  it('Priimti posts inviteID to /leagues/accept and Atmesti to /leagues/decline', () => {
    render(<InviteList invites={invites} />);
    const row = nth(screen.getAllByTestId('invite-row'), 0);
    for (const [label, action] of [
      ['Priimti', '/leagues/accept'],
      ['Atmesti', '/leagues/decline'],
    ] as const) {
      const form = within(row)
        .getByRole('button', { name: label })
        .closest('form');
      expect(form?.getAttribute('method')).toBe('post');
      expect(form?.getAttribute('action')).toBe(action);
      expect(
        form?.querySelector<HTMLInputElement>('[name="inviteID"]')?.value,
      ).toBe('3');
    }
  });
});
