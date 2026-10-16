import { describe, expect, it } from 'vitest';
import { roundNo } from '../testing';
import type { Tournament } from '../tournament/tournament';
import {
  NO_TOURNAMENT_FACTS,
  tournamentFacts,
  tournamentFactsSchema,
} from './tournament-facts';

const tournament = (own: Partial<Tournament>): Tournament => ({
  id: 1,
  slug: 'euroleague',
  name: 'Euroleague',
  format: 'euroleague',
  endsOn: null,
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
  ...own,
});

describe('tournamentFacts (R-106, R-128, R-133)', () => {
  it('counts the teams and reads the survival switch', () => {
    expect(tournamentFacts(tournament({ survival: true }), 20)).toMatchObject({
      teamCount: 20,
      survival: true,
    });
    expect(tournamentFacts(tournament({ survival: false }), 0)).toMatchObject({
      teamCount: 0,
      survival: false,
    });
  });

  it("uses the tournament's own deadline round", () => {
    expect(
      tournamentFacts(tournament({ standingsDeadlineRound: roundNo(2) }), 4)
        .deadlineRound,
    ).toBe(2);
  });

  it('uses the default round 5 (ST-2) when it has none of its own', () => {
    expect(
      tournamentFacts(tournament({ standingsDeadlineRound: null }), 4)
        .deadlineRound,
    ).toBe(5);
  });
});

describe('NO_TOURNAMENT_FACTS', () => {
  it('leaves the table length and the deadline round out and plays no survival', () => {
    expect(NO_TOURNAMENT_FACTS).toEqual({
      teamCount: null,
      deadlineRound: null,
      survival: false,
    });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(NO_TOURNAMENT_FACTS)).toBe(true);
  });
});

describe('tournamentFactsSchema', () => {
  it('accepts the facts of a tournament and the absent value', () => {
    expect(
      tournamentFactsSchema.safeParse({
        teamCount: 20,
        deadlineRound: 5,
        survival: true,
      }).success,
    ).toBe(true);
    expect(tournamentFactsSchema.safeParse(NO_TOURNAMENT_FACTS).success).toBe(
      true,
    );
  });

  it.each([
    { teamCount: -1, deadlineRound: 5, survival: true },
    { teamCount: 2.5, deadlineRound: 5, survival: true },
    { teamCount: 20, deadlineRound: 0, survival: true },
    { teamCount: 20, deadlineRound: 5, survival: 'yes' },
    { teamCount: 20, deadlineRound: 5 },
  ])('refuses %j', (value) => {
    expect(tournamentFactsSchema.safeParse(value).success).toBe(false);
  });
});
