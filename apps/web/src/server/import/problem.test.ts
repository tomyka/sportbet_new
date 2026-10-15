import { describe, expect, it } from 'vitest';
import {
  imported,
  importedSchema,
  importProblem,
  importProblemSchema,
} from './problem';

// What the import cannot do, as the flash carries it: the refusals of the
// plan and the apply, the feed's failures and refusals, a bad season code.

const SEASON = 'E2026';

describe('importProblem', () => {
  it('keeps what a refusal is about, and nothing else', () => {
    expect(
      importProblem({ kind: 'round-not-regular', round: 3 }, SEASON),
    ).toEqual({ kind: 'round-not-regular', round: 3 });
    expect(
      importProblem(
        { kind: 'duplicate-fixture', round: 2, home: 'A', away: 'B' },
        SEASON,
      ),
    ).toEqual({ kind: 'duplicate-fixture', round: 2, home: 'A', away: 'B' });
    expect(
      importProblem({ kind: 'malformed', number: 7, field: 'utcDate' }, SEASON),
    ).toEqual({ kind: 'malformed', number: 7, field: 'utcDate' });
  });

  it("names the season an HTTP error was asked about, as sportbet's text does", () => {
    expect(importProblem({ kind: 'http-error', status: 404 }, 'E2031')).toEqual(
      { kind: 'http-error', status: 404, season: 'E2031' },
    );
  });

  it.each([
    'unreachable',
    'not-json',
    'no-games',
    'tournament-finished',
    'plan-changed',
    'no-tournament',
  ] as const)('%s needs nothing more', (kind) => {
    expect(importProblem({ kind }, SEASON)).toEqual({ kind });
  });

  it('clips a name a cookie could not hold, and lists at most 20 unmatched teams', () => {
    const long = 'x'.repeat(200);
    const problem = importProblem(
      {
        kind: 'unmatched-teams',
        teams: Array.from(
          { length: 40 },
          (_, index) => `${long}${String(index)}`,
        ),
      },
      SEASON,
    );
    expect(importProblemSchema.safeParse(problem).success).toBe(true);
    expect(problem.kind === 'unmatched-teams' && problem.teams).toHaveLength(
      20,
    );
    expect(
      importProblem({ kind: 'duplicate-team-names', team: long }, SEASON),
    ).toEqual({ kind: 'duplicate-team-names', team: 'x'.repeat(40) });
  });
});

describe('importProblemSchema', () => {
  it('opens what importProblem writes, and nothing a stranger could add', () => {
    expect(importProblemSchema.safeParse({ kind: 'bad-season' }).success).toBe(
      true,
    );
    expect(importProblemSchema.safeParse({ kind: 'anything' }).success).toBe(
      false,
    );
    expect(
      importProblemSchema.safeParse({
        kind: 'unmatched-teams',
        teams: Array.from({ length: 21 }, () => 'A'),
      }).success,
    ).toBe(false);
  });
});

describe('imported', () => {
  it("is sportbet's counts, the players renamed for the message", () => {
    expect(
      imported({
        teams: 20,
        rounds: 2,
        games: 20,
        moved: 1,
        skipped: 2,
        playersSeeded: 5,
        teamsWithoutCrest: ['Nauja'],
      }),
    ).toEqual({
      teams: 20,
      rounds: 2,
      games: 20,
      moved: 1,
      skipped: 2,
      players: 5,
      withoutCrest: ['Nauja'],
    });
  });

  it('lists at most 20 crestless teams, each clipped, and stays a value the schema opens', () => {
    const result = imported({
      teams: 40,
      rounds: 1,
      games: 1,
      moved: 0,
      skipped: 0,
      playersSeeded: 0,
      teamsWithoutCrest: Array.from({ length: 40 }, () => 'y'.repeat(90)),
    });
    expect(result.withoutCrest).toHaveLength(20);
    expect(importedSchema.safeParse(result).success).toBe(true);
  });
});
