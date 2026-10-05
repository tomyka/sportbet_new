import { describe, expect, it } from 'vitest';
import { Season } from '../round/season';
import type { Game } from '../round/game';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  scriptedDice,
  team,
  unwrap,
} from '../testing';
import type { Tournament } from '../tournament/tournament';
import {
  isOpenForRegistration,
  joinTournament,
  registrationIsOpen,
  tournamentToJoin,
  type JoinCandidate,
} from './joining';

const JONAS = player('jonas');
const TEAMS = [team('ZAL'), team('OLY'), team('MON'), team('VIR')];
const END = at('2027-05-24T00:00:00Z');

/** Rounds 1 to 5: round 5's first game is the standings deadline (ST-2, R-8). */
function seasonOf(games: readonly Game[], endsAt = END): Season {
  return unwrap(
    Season.create({
      rounds: [1, 2, 3, 4, 5].map((number) => makeRound({ number })),
      games,
      endsAt,
    }),
  );
}

const ROUND_1 = makeGame({
  id: 1,
  round: 1,
  home: 'ZAL',
  away: 'OLY',
  tipOff: '2026-10-02T18:00:00Z',
});
const ROUND_1_SCORED = makeGame({
  id: 1,
  round: 1,
  home: 'ZAL',
  away: 'OLY',
  tipOff: '2026-10-02T18:00:00Z',
  result: [88, 79],
});
const ROUND_2 = makeGame({
  id: 2,
  round: 2,
  home: 'MON',
  away: 'VIR',
  tipOff: '2026-10-09T18:00:00Z',
});
const ROUND_5 = makeGame({
  id: 5,
  round: 5,
  home: 'ZAL',
  away: 'MON',
  tipOff: '2026-11-03T18:00:00Z',
});

const tournament = (id: number, slug: string): Tournament => ({
  id,
  slug,
  name: slug,
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
});

const candidate = (
  id: number,
  slug: string,
  games: readonly Game[],
  endsAt = END,
): JoinCandidate => ({
  tournament: tournament(id, slug),
  season: seasonOf(games, endsAt),
});

const join = (
  season: Season,
  now: string,
  rules = ruledRules,
  alreadyIn = false,
) =>
  joinTournament({
    player: JONAS,
    season,
    teams: TEAMS,
    alreadyIn,
    rules,
    now: at(now),
    dice: scriptedDice([0, 0, 0, 17, 17, 17]),
  });

describe('a tournament taking players (TournamentRegistrationService::isOpenForRegistration)', () => {
  const season = seasonOf([ROUND_1, ROUND_2, ROUND_5]);

  it('registration (sportbet): open until the first game tips off, closed from then', () => {
    expect(
      isOpenForRegistration(season, at('2026-10-02T17:59:59Z'), sportbetRules),
    ).toBe(true);
    expect(
      isOpenForRegistration(season, at('2026-10-02T18:00:00Z'), sportbetRules),
    ).toBe(false);
  });

  it('registration (ruled): open until round 5 starts (R-8)', () => {
    expect(
      isOpenForRegistration(season, at('2026-11-03T17:59:59Z'), ruledRules),
    ).toBe(true);
    expect(
      isOpenForRegistration(season, at('2026-11-03T18:00:00Z'), ruledRules),
    ).toBe(false);
  });

  it('registration: a finished tournament takes nobody, even one with no games', () => {
    const over = seasonOf([], at('2026-05-25T00:00:00Z'));
    expect(
      isOpenForRegistration(over, at('2026-10-05T12:00:00Z'), sportbetRules),
    ).toBe(false);
    expect(
      isOpenForRegistration(over, at('2026-10-05T12:00:00Z'), ruledRules),
    ).toBe(false);
  });
});

describe('joining (TournamentRegistrationService::register, PredictionRows::seedMissing)', () => {
  it('joining: a newcomer gets a blank row for every game and a standings row for every team', () => {
    const joined = unwrap(
      join(seasonOf([ROUND_1, ROUND_2]), '2026-10-01T12:00:00Z'),
    );
    expect(joined.newcomer).toBe(true);
    expect(joined.blankGames).toEqual([gameNo(1), gameNo(2)]);
    expect(joined.standingsTeams).toEqual(TEAMS);
    expect(joined.lateFillIns).toEqual([]);
  });

  it('joining: refused while the tournament takes nobody, under either set', () => {
    const season = seasonOf([ROUND_1, ROUND_2, ROUND_5]);
    expect(join(season, '2026-10-03T12:00:00Z', sportbetRules)).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
    expect(join(season, '2026-11-04T12:00:00Z', ruledRules)).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
  });

  it('late joiner (ruled): the games already played are filled in, the rest blank (R-9)', () => {
    const joined = unwrap(
      join(
        seasonOf([ROUND_1_SCORED, ROUND_2, ROUND_5]),
        '2026-10-05T12:00:00Z',
      ),
    );
    expect(joined.lateFillIns.map((prediction) => prediction.game)).toEqual([
      gameNo(1),
    ]);
    expect(joined.lateFillIns[0]?.origin).toBe('late-fill-in');
    expect(joined.lateFillIns[0]?.filledInAt).toBe(at('2026-10-05T12:00:00Z'));
    expect(joined.blankGames).toEqual([gameNo(2), gameNo(5)]);
  });

  it('late joiner (sportbet): never filled in - a tournament under way takes nobody', () => {
    expect(
      join(
        seasonOf([ROUND_1_SCORED, ROUND_2]),
        '2026-10-05T12:00:00Z',
        sportbetRules,
      ).ok,
    ).toBe(false);
  });

  it('joining again fills nobody in: a player already in only gets the rows they miss', () => {
    const joined = unwrap(
      join(
        seasonOf([ROUND_1_SCORED, ROUND_2, ROUND_5]),
        '2026-10-05T12:00:00Z',
        ruledRules,
        true,
      ),
    );
    expect(joined.newcomer).toBe(false);
    expect(joined.lateFillIns).toEqual([]);
    expect(joined.blankGames).toEqual([gameNo(1), gameNo(2), gameNo(5)]);
  });
});

describe('registration open at all (ChecksRegistrationDeadline::anyTournamentIsJoinable)', () => {
  /** What the narrow query loads: each tournament's window, not its season. */
  const windows = (...each: JoinCandidate[]) =>
    each.map(({ season }) => season.registrationWindow());
  const NOW = at('2026-10-05T12:00:00Z');
  const open = candidate(2, 'euroleague-2026-27', [ROUND_5]);
  const started = candidate(1, 'euroleague-2025-26', [ROUND_1_SCORED], END);
  const finished = candidate(
    1,
    'euroleague-2025-26',
    [ROUND_1_SCORED],
    at('2026-05-25T00:00:00Z'),
  );

  it('registration: open while some unfinished tournament takes players', () => {
    expect(registrationIsOpen(windows(started, open), NOW, sportbetRules)).toBe(
      true,
    );
    expect(registrationIsOpen(windows(started), NOW, sportbetRules)).toBe(
      false,
    );
  });

  it('registration: with no tournament and no game at all, open (Q4: an empty installation)', () => {
    expect(registrationIsOpen(windows(), NOW, ruledRules)).toBe(true);
  });

  it('registration: with only finished tournaments, closed while any game exists, open when none does', () => {
    expect(registrationIsOpen(windows(finished), NOW, ruledRules)).toBe(false);
    const finishedEmpty = candidate(
      1,
      'euroleague-2025-26',
      [],
      at('2026-05-25T00:00:00Z'),
    );
    expect(registrationIsOpen(windows(finishedEmpty), NOW, ruledRules)).toBe(
      true,
    );
  });
});

describe('the tournament a new account joins (PostRegisterController, R-27)', () => {
  const NOW = at('2026-10-05T12:00:00Z');
  const sooner = candidate(2, 'euroleague-2026-27', [
    makeGame({
      id: 21,
      round: 1,
      home: 'ZAL',
      away: 'OLY',
      tipOff: '2026-10-09T18:00:00Z',
    }),
  ]);
  const later = candidate(3, 'euroleague-2027-28', [
    makeGame({
      id: 31,
      round: 1,
      home: 'ZAL',
      away: 'OLY',
      tipOff: '2026-10-16T18:00:00Z',
    }),
  ]);
  const closed = candidate(1, 'euroleague-2025-26', [ROUND_1_SCORED]);
  const choose = (intended: string | null, candidates: JoinCandidate[]) =>
    tournamentToJoin({ intended, candidates, now: NOW, rules: sportbetRules })
      ?.slug ?? null;

  it('joining (R-27): the ?tournament= one, when it takes players', () => {
    expect(choose('euroleague-2027-28', [closed, sooner, later])).toBe(
      'euroleague-2027-28',
    );
  });

  it('joining (R-27): an unknown or closed one falls back to the open tournament whose next game is soonest', () => {
    expect(choose('no-such-tournament', [later, sooner, closed])).toBe(
      'euroleague-2026-27',
    );
    expect(choose('euroleague-2025-26', [later, sooner, closed])).toBe(
      'euroleague-2026-27',
    );
    expect(choose(null, [later, sooner])).toBe('euroleague-2026-27');
  });

  it('joining (R-27): none open joins none', () => {
    expect(choose('euroleague-2025-26', [closed])).toBeNull();
    expect(choose(null, [])).toBeNull();
  });

  it('joining (R-27, Q1): one with a next game before one without; without one, or on a tie, the newest', () => {
    const noFixtures = candidate(4, 'euroleague-2028-29', []);
    const olderNoFixtures = candidate(1, 'euroleague-2024-25', []);
    expect(choose(null, [noFixtures, later])).toBe('euroleague-2027-28');
    expect(choose(null, [olderNoFixtures, noFixtures])).toBe(
      'euroleague-2028-29',
    );
    const sameMoment = candidate(5, 'euroleague-2029-30', [
      makeGame({
        id: 51,
        round: 1,
        home: 'ZAL',
        away: 'OLY',
        tipOff: '2026-10-09T18:00:00Z',
      }),
    ]);
    expect(choose(null, [sooner, sameMoment])).toBe('euroleague-2029-30');
  });
});
