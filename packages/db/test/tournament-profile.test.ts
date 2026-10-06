import { newTournamentSchema, type TournamentProfile } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import {
  insertTournaments,
  loadTournamentProfiles,
  saveTournamentProfile,
} from '../src';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { OTHER, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: false,
};

describe('tournament profiles', () => {
  it("profile: a tournament saved without one has sportbet's defaults: upcoming, no date, public", async () => {
    await saveTournament(db, TOURNAMENT);
    expect(await loadTournamentProfiles(db)).toEqual(
      new Map([
        [
          TOURNAMENT.id,
          {
            status: 'upcoming',
            startsOn: null,
            sport: 'basketball',
            description: null,
            isPublic: true,
          },
        ],
      ]),
    );
  });

  it('profile: is saved for its tournament alone, and read back by id', async () => {
    await saveTournament(db, TOURNAMENT);
    await saveTournament(db, OTHER);
    await saveTournamentProfile(db, TOURNAMENT, PROFILE);
    const profiles = await loadTournamentProfiles(db);
    expect(profiles.get(TOURNAMENT.id)).toEqual(PROFILE);
    expect(profiles.get(OTHER.id)?.status).toBe('upcoming');
  });

  it('profile: saving one for a tournament that is not stored is a programmer error', async () => {
    await expect(
      saveTournamentProfile(db, TOURNAMENT, PROFILE),
    ).rejects.toThrow('saveTournamentProfile: tournament 3 is not stored');
  });

  it('profile: a tournament inserted by slug gets the defaults too', async () => {
    await insertTournaments(db, [
      newTournamentSchema.parse({ ...TOURNAMENT, slug: 'by-slug' }),
    ]);
    expect([...(await loadTournamentProfiles(db)).values()]).toHaveLength(1);
  });
});
