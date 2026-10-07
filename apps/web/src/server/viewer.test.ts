import type { Role } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { viewerOf } from './viewer';

// The one place the R-50 viewer is built from the signed-in player.

describe('viewerOf', () => {
  const signedIn = (role: Role) => ({
    player: player('7'),
    name: 'Jonas',
    surname: 'Petraitis',
    role,
    lastTournament: null,
  });

  it('viewer: a player, not an admin', () => {
    expect(viewerOf(signedIn('player'))).toEqual({
      player: player('7'),
      isAdmin: false,
    });
  });

  it('viewer: an admin, by their role (R-50 shows them every tournament)', () => {
    expect(viewerOf(signedIn('results-manager')).isAdmin).toBe(true);
    expect(viewerOf(signedIn('superadmin')).isAdmin).toBe(true);
  });
});
