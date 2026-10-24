import { describe, expect, it } from 'vitest';
import { Season } from '../round/season';
import { at, makeGame, makeRound, unwrap } from '../testing';
import {
  chooseTournament,
  mayOpenSurvivalSummary,
  NO_TOURNAMENT_NAV,
  showsSurvivalSummaryEntry,
  tournamentContext,
} from './tournament-context';

const END = at('2027-05-31T00:00:00Z');

/** Round 1 (survival as given) with games at 18:00 on 10-01 and 10-02; round 5 on 10-29. */
function season(
  options: {
    round1Survival?: boolean;
    scored?: boolean;
    round1Scored?: boolean;
    round5Scored?: boolean;
  } = {},
): Season {
  return unwrap(
    Season.create({
      rounds: [
        makeRound({ number: 1, survival: options.round1Survival ?? true }),
        makeRound({ number: 5 }),
      ],
      games: [
        makeGame({
          id: 1,
          round: 1,
          home: 'ZAL',
          away: 'OLY',
          tipOff: '2026-10-01T18:00:00Z',
          ...(options.scored === true ? { result: [80, 75] as const } : {}),
        }),
        makeGame({
          id: 2,
          round: 1,
          home: 'RMB',
          away: 'FCB',
          tipOff: '2026-10-02T18:00:00Z',
          ...(options.round1Scored === true
            ? { result: [70, 65] as const }
            : {}),
        }),
        makeGame({
          id: 3,
          round: 5,
          home: 'ZAL',
          away: 'RMB',
          tipOff: '2026-10-29T18:00:00Z',
          ...(options.round5Scored === true
            ? { result: [90, 80] as const }
            : {}),
        }),
      ],
      endsAt: END,
    }),
  );
}

const context = (
  when: string,
  options: {
    round1Survival?: boolean;
    scored?: boolean;
    round1Scored?: boolean;
    round5Scored?: boolean;
    survival?: boolean;
  } = {},
) =>
  tournamentContext({
    season: season(options),
    survival: options.survival ?? true,
    now: at(when),
  });

// sportbet's NavVisibilityTest::test_has_kicked_off.
describe('started (NavVisibility::hasKickedOff)', () => {
  it('no games yet: not started', () => {
    const empty = unwrap(Season.create({ rounds: [], games: [], endsAt: END }));
    expect(
      tournamentContext({
        season: empty,
        survival: true,
        now: at('2026-10-01T18:00:00Z'),
      }).started,
    ).toBe(false);
  });

  it('first game tomorrow: not started', () => {
    expect(context('2026-09-30T18:00:00Z').started).toBe(false);
  });

  it('first game an hour ago: started', () => {
    expect(context('2026-10-01T19:00:00Z').started).toBe(true);
  });

  it('exactly at kick-off: not yet', () => {
    expect(context('2026-10-01T18:00:00Z').started).toBe(false);
  });
});

// sportbet's NavVisibilityTest::test_show_survival and TournamentSessionTest.
describe('nav.survival (NavVisibility::showSurvival)', () => {
  it('the current round and the tournament both play survival: shown', () => {
    expect(context('2026-09-30T18:00:00Z').nav.survival).toBe(true);
  });

  it('the current round does not: hidden', () => {
    expect(
      context('2026-09-30T18:00:00Z', { round1Survival: false }).nav.survival,
    ).toBe(false);
  });

  it('the tournament does not: hidden, whatever the round says', () => {
    expect(
      context('2026-09-30T18:00:00Z', { survival: false }).nav.survival,
    ).toBe(false);
  });
});

// sportbet's NavVisibilityTest: show_summary and show_survival_summary.
describe('nav.summary and nav.survivalSummary', () => {
  it('the summary shows once the tournament has started', () => {
    expect(context('2026-09-30T18:00:00Z').nav.summary).toBe(false);
    expect(context('2026-10-01T19:00:00Z').nav.summary).toBe(true);
  });

  it('the summary shows once any result is in, even before the first game', () => {
    expect(context('2026-09-30T18:00:00Z', { scored: true }).nav.summary).toBe(
      true,
    );
  });

  it('the survival summary follows the tournament flag alone', () => {
    expect(context('2026-09-30T18:00:00Z').nav.survivalSummary).toBe(true);
    expect(
      context('2026-09-30T18:00:00Z', { survival: false }).nav.survivalSummary,
    ).toBe(false);
  });
});

describe('who may see the survival summary', () => {
  const nav = (summary: boolean, survivalSummary: boolean) => ({
    summary,
    survivalSummary,
  });

  it.each([
    // summary, survivalSummary, may open the page, shows the nav entry
    [false, false, false, false],
    [false, true, true, false],
    [true, false, false, false],
    [true, true, true, true],
  ])(
    'summary %s, survival summary %s: page %s, entry %s',
    (summary, survivalSummary, opens, entry) => {
      expect(mayOpenSurvivalSummary(nav(summary, survivalSummary))).toBe(opens);
      expect(showsSurvivalSummaryEntry(nav(summary, survivalSummary))).toBe(
        entry,
      );
    },
  );

  it('the page is reachable before the tournament starts, while the entry waits', () => {
    const before = context('2026-09-30T18:00:00Z').nav;
    expect(mayOpenSurvivalSummary(before)).toBe(true);
    expect(showsSurvivalSummaryEntry(before)).toBe(false);
  });
});

// sportbet's StandingsDeadlineTest, through Season (ST-2).
describe('standingsLocked (StandingsDeadline::passedAt)', () => {
  it("open past the deadline round's kick-off, locked once its last result is entered", () => {
    expect(context('2026-10-29T17:59:59Z').standingsLocked).toBe(false);
    expect(context('2026-10-30T12:00:00Z').standingsLocked).toBe(false);
    expect(
      context('2026-10-30T12:00:00Z', { round5Scored: true }).standingsLocked,
    ).toBe(true);
  });

  it('never locks a tournament with no game in its deadline round', () => {
    const short = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
          }),
        ],
        endsAt: END,
      }),
    );
    expect(
      tournamentContext({
        season: short,
        survival: true,
        now: at('2027-01-01T00:00:00Z'),
      }).standingsLocked,
    ).toBe(false);
  });
});

it('the current round is the round of the soonest game still waiting for a result (LR-3, R-141)', () => {
  expect(context('2026-10-01T19:00:00Z').currentRound).toBe(1);
  // Both of round 1's games were played but have no result: round 1 stays
  // current until they are entered.
  expect(context('2026-10-03T12:00:00Z').currentRound).toBe(1);
  expect(
    context('2026-10-03T12:00:00Z', { scored: true, round1Scored: true })
      .currentRound,
  ).toBe(5);
});

it('a player in no tournament has every flag off (SessionController::setLeaguelessSession)', () => {
  expect(NO_TOURNAMENT_NAV).toEqual({
    survival: false,
    summary: false,
    survivalSummary: false,
  });
});

// R-28, then SessionController::activeMembership.
describe('chooseTournament', () => {
  it('R-28: the last-used tournament, when the player is in it', () => {
    expect(chooseTournament({ lastUsed: 4, playing: [2, 4, 7] })).toBe(4);
  });

  it('not the last-used one when the player is no longer in it', () => {
    expect(chooseTournament({ lastUsed: 9, playing: [4] })).toBe(4);
  });

  it('the one tournament a player is in, with none last used', () => {
    expect(chooseTournament({ lastUsed: null, playing: [4] })).toBe(4);
  });

  it('none for a player in no tournament', () => {
    expect(chooseTournament({ lastUsed: null, playing: [] })).toBeNull();
    expect(chooseTournament({ lastUsed: 4, playing: [] })).toBeNull();
  });

  it('Q1, the owner: among several, with none last used, the newest', () => {
    expect(chooseTournament({ lastUsed: null, playing: [2, 7, 4] })).toBe(7);
  });
});
