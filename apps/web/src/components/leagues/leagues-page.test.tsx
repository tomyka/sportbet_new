import { render, screen } from '@testing-library/react';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  leagueCard,
  leaguesPageOf,
  ownerCard,
} from '../../../tests/support/league-views';
import { LeaguesView } from './leagues-page';

// leagues/index.blade.php: the flash, the invites, "Mano lygos".

const view = (
  page = leaguesPageOf([leagueCard()]),
  flash: Parameters<typeof LeaguesView>[0]['flash'] = null,
) => render(<LeaguesView page={page} viewer={player('1')} flash={flash} />);

describe('the leagues page', () => {
  it('lists the leagues under "Mano lygos" with the create button', () => {
    view(leaguesPageOf([leagueCard(), ownerCard({ name: 'Mano' })]));
    expect(screen.getByText('Mano lygos')).toBeTruthy();
    expect(screen.getAllByTestId('league-row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Sukurti lygą' })).toBeTruthy();
  });

  it('says "Dar nepriklausote jokiai lygai." when there is none', () => {
    view(leaguesPageOf([]));
    expect(screen.getByText('Dar nepriklausote jokiai lygai.')).toBeTruthy();
    expect(screen.queryByTestId('league-row')).toBeNull();
  });

  it('draws no invites card without invites, and the invites with their count when there are', () => {
    const none = view();
    expect(screen.queryByText('Kvietimai')).toBeNull();
    none.unmount();
    view(
      leaguesPageOf(
        [leagueCard()],
        [
          { id: 3, leagueName: 'Kitų lyga', invitedBy: 'petras' },
          { id: 5, leagueName: 'Dar viena', invitedBy: '-' },
        ],
      ),
    );
    expect(screen.getByText('Kvietimai')).toBeTruthy();
    expect(screen.getByTestId('invite-count').textContent).toBe('2');
    expect(screen.getAllByTestId('invite-row')).toHaveLength(2);
  });

  it("shows the last action's message", () => {
    view(leaguesPageOf([leagueCard()]), {
      kind: 'league',
      message: 'league-created',
    });
    expect(screen.getByRole('status').textContent).toBe('Lyga sukurta');
  });

  it('draws no message when there is none', () => {
    view();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws the Mokėjimai link on an admin card of a private league, to its payments page', () => {
    view(leaguesPageOf([ownerCard()]));
    const link = screen.getByTitle('Mokėjimai');
    expect(link.getAttribute('href')).toBe('/leagues/7/payments');
  });

  it('draws no Mokėjimai link on a card without the right', () => {
    view(leaguesPageOf([leagueCard()]));
    expect(screen.queryByTitle('Mokėjimai')).toBeNull();
  });
});
