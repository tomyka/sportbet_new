import { player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { viewerOf } from './viewer';

// The one place the R-50 viewer is built from the signed-in player.

describe('viewerOf', () => {
  const signedIn = (adminLevel: number) => ({
    player: player('7'),
    name: 'Jonas',
    surname: 'Petraitis',
    adminLevel,
    lastTournament: null,
  });

  it('viewer: a player, not an admin', () => {
    expect(viewerOf(signedIn(0))).toEqual({
      player: player('7'),
      isAdmin: false,
    });
  });

  it('viewer: an admin, by their level (R-50 shows them every tournament)', () => {
    expect(viewerOf(signedIn(1)).isAdmin).toBe(true);
  });
});
