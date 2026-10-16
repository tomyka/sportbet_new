// loadTournamentFacts and findDescribedTournament (slice 18, #35): what /rules
// and /help describe - the team count, the deadline round, the survival
// switch - and the tournament they describe: the player's own, else the
// visitor's (Tournament::forVisitor).

import {
  ruledRules,
  sportbetRules,
  tournamentFactsSchema,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { at, roundNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  findDescribedTournament,
  loadTournamentFacts,
  saveTournamentProfile,
} from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { G10, G7, G8, G9, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

/** After game 7 (scored), before the rest. */
const NOW = at('2026-10-05T12:00:00Z');
const GUEST = { player: null, isAdmin: false } as const;

const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: null,
  isPublic: true,
};

/** Ended before NOW: finished under R-21, as under sportbet's status. */
const ENDED = { ...TOURNAMENT, endsOn: '2026-05-24' };

describe('loadTournamentFacts', () => {
  it("counts the tournament's teams and reads its survival switch", async () => {
    await saveWorld(db);
    expect(await loadTournamentFacts(db, TOURNAMENT)).toMatchObject({
      teamCount: 4,
      survival: true,
    });
    const without = { ...TOURNAMENT, survival: false };
    await saveTournament(db, without);
    expect((await loadTournamentFacts(db, without)).survival).toBe(false);
  });

  it('counts none for a tournament with no teams', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    expect((await loadTournamentFacts(db, OTHER)).teamCount).toBe(0);
  });

  it('uses the default deadline round (5) when the tournament has none of its own', async () => {
    await saveWorld(db);
    await saveGames(db, TOURNAMENT, [G7, G8, G9, G10]);
    expect(await loadTournamentFacts(db, TOURNAMENT)).toMatchObject({
      deadlineRound: 5,
    });
  });

  it("uses the tournament's own deadline round, with or without games in it", async () => {
    await saveWorld(db);
    const own = { ...TOURNAMENT, standingsDeadlineRound: roundNo(2) };
    await saveTournament(db, own);
    expect((await loadTournamentFacts(db, own)).deadlineRound).toBe(2);
    await saveGames(db, own, [G7, G8, G9]);
    expect((await loadTournamentFacts(db, own)).deadlineRound).toBe(2);
  });

  it('answers a value the domain schema accepts', async () => {
    await saveWorld(db);
    const facts = await loadTournamentFacts(db, TOURNAMENT);
    expect(tournamentFactsSchema.parse(facts)).toEqual(facts);
  });
});

describe('findDescribedTournament', () => {
  const visit = (rules = ruledRules, own: Tournament | null = null) =>
    findDescribedTournament(db, { own, viewer: GUEST, now: NOW, rules });

  it('finds nothing on an empty database', async () => {
    expect(await visit()).toBeNull();
  });

  it('gives a guest the active tournament before an upcoming one, with its facts, whatever their ids', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await saveTournamentProfile(db, TOURNAMENT, PROFILE);
    await saveTournamentProfile(db, OTHER, {
      ...PROFILE,
      status: 'upcoming',
      startsOn: '2027-10-01',
    });
    await saveGames(db, TOURNAMENT, [G7, G8, G9, G10]);
    const found = await visit();
    expect(found?.tournament.id).toBe(TOURNAMENT.id);
    expect(found?.facts).toEqual({
      teamCount: 4,
      deadlineRound: 5,
      survival: true,
    });
  });

  it('skips a finished tournament for the next card', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await saveTournament(db, ENDED);
    await saveTournamentProfile(db, ENDED, {
      ...PROFILE,
      status: 'finished',
    });
    await saveTournamentProfile(db, OTHER, {
      ...PROFILE,
      status: 'upcoming',
      startsOn: '2027-10-01',
    });
    expect((await visit())?.tournament.id).toBe(OTHER.id);
  });

  it('is null when every visible tournament is finished', async () => {
    await saveWorld(db);
    await saveTournament(db, ENDED);
    await saveTournamentProfile(db, ENDED, {
      ...PROFILE,
      status: 'finished',
    });
    expect(await visit()).toBeNull();
  });

  it('never gives a guest a tournament that is not public (R-50, ruledRules)', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await saveTournamentProfile(db, TOURNAMENT, {
      ...PROFILE,
      isPublic: false,
    });
    await saveTournamentProfile(db, OTHER, {
      ...PROFILE,
      status: 'upcoming',
      startsOn: '2027-10-01',
    });
    expect((await visit())?.tournament.id).toBe(OTHER.id);
    await saveTournamentProfile(db, OTHER, {
      ...PROFILE,
      status: 'upcoming',
      startsOn: '2027-10-01',
      isPublic: false,
    });
    expect(await visit()).toBeNull();
  });

  it('keeps the hub order for two active tournaments: earliest start, then lowest id', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await saveTournamentProfile(db, TOURNAMENT, PROFILE);
    await saveTournamentProfile(db, OTHER, {
      ...PROFILE,
      startsOn: '2026-09-01',
    });
    expect((await visit())?.tournament.id).toBe(OTHER.id);
    await saveTournamentProfile(db, OTHER, PROFILE);
    expect((await visit())?.tournament.id).toBe(TOURNAMENT.id);
  });

  it("gives a player's own tournament, with its facts, before any visitor's choice, finished or not", async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await saveTournament(db, ENDED);
    await saveTournamentProfile(db, ENDED, { ...PROFILE, status: 'finished' });
    await saveTournamentProfile(db, OTHER, PROFILE);
    const found = await visit(ruledRules, ENDED);
    expect(found?.tournament.id).toBe(ENDED.id);
    expect(found?.facts).toEqual(await loadTournamentFacts(db, ENDED));
  });

  it("gives a player's own tournament even when there is no tournament a guest may see", async () => {
    await saveWorld(db);
    expect((await visit(ruledRules, TOURNAMENT))?.tournament.id).toBe(
      TOURNAMENT.id,
    );
  });

  it('applies the rule set it is given to who may see what', async () => {
    await saveWorld(db);
    await saveTournamentProfile(db, TOURNAMENT, {
      ...PROFILE,
      isPublic: false,
    });
    expect(await visit(ruledRules)).toBeNull();
    expect((await visit(sportbetRules))?.tournament.id).toBe(TOURNAMENT.id);
  });
});
