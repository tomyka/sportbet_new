import type { TournamentProfile } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { loadSeason, saveTournamentProfile } from '../src';
import { saveGames } from '../src/season/repository';
import { loadTournamentCatalogue } from '../src/tournament/catalogue';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { GAMES, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: false,
};

describe('loadTournamentCatalogue', () => {
  it('catalogue: every tournament by id, with its profile and its registration window, in one read', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await saveGames(db, TOURNAMENT, GAMES);
    await saveTournamentProfile(db, OTHER, PROFILE);
    const catalogue = await loadTournamentCatalogue(db);
    expect(catalogue.map(({ tournament }) => tournament)).toEqual([
      TOURNAMENT,
      OTHER,
    ]);
    expect(catalogue.map(({ profile }) => profile)).toEqual([
      {
        status: 'upcoming',
        startsOn: null,
        sport: 'basketball',
        description: null,
        isPublic: true,
      },
      PROFILE,
    ]);
  });

  it('catalogue: each window is the one its season gives (Season.registrationWindow), with games and without', async () => {
    await saveWorld(db);
    await saveTournament(db, { ...OTHER, endsOn: null });
    await saveGames(db, TOURNAMENT, GAMES);
    for (const { tournament, window } of await loadTournamentCatalogue(db)) {
      expect(window).toEqual(
        (await loadSeason(db, tournament)).registrationWindow(),
      );
    }
  });

  it('catalogue: no tournament, an empty catalogue', async () => {
    expect(await loadTournamentCatalogue(db)).toEqual([]);
  });
});
