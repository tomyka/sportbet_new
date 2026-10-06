import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_STATUSES,
  tournamentProfileSchema,
} from './tournament-profile';

const PROFILE = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: true,
} as const;

describe('tournament profile', () => {
  it("profile: holds sportbet's three statuses, in its enum's order", () => {
    expect(TOURNAMENT_STATUSES).toEqual(['upcoming', 'active', 'finished']);
  });

  it('profile: takes a full profile, and one with no start date and no description', () => {
    expect(tournamentProfileSchema.parse(PROFILE)).toEqual(PROFILE);
    expect(
      tournamentProfileSchema.parse({
        ...PROFILE,
        startsOn: null,
        description: null,
      }),
    ).toEqual({ ...PROFILE, startsOn: null, description: null });
  });

  it('profile: refuses a status sportbet does not have, and a start date that is no date', () => {
    expect(
      tournamentProfileSchema.safeParse({ ...PROFILE, status: 'paused' })
        .success,
    ).toBe(false);
    expect(
      tournamentProfileSchema.safeParse({ ...PROFILE, startsOn: '2026-02-30' })
        .success,
    ).toBe(false);
  });
});
