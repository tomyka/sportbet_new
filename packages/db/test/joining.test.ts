// TournamentRegistrationService::register and PredictionRows::seedMissing:
// a join writes the player's place and blank rows once, only while the
// tournament takes players; a late joiner is filled in and scored under
// ruledRules (R-9), never under sportbetRules (R-8 closes it first).

import {
  Game,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  seededDice,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  isRegistrationOpen,
  loadJoinCandidates,
  loadTournamentPoints,
  registerForTournament,
  savePlayers,
  saveTournamentProfile,
} from '../src';
import {
  loadRegistrationWindows,
  loadRegistrationWindowsById,
} from '../src/joining/repository';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { G10, G7, G9, OLY, OTHER, REA, saveWorld, TOURNAMENT } from './world';
import { saveTournament } from '../src/tournament/repository';

const { db, client } = useTestDatabase();

const JONAS = player('9');

/** Game 11: round 1, still to come all season (the return of game 10). */
const G11 = unwrap(
  Game.stored({
    id: gameNo(11),
    round: roundNo(1),
    home: OLY,
    away: REA,
    tipOff: at('2026-12-01T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);

const rowsOf = z.array(
  z.object({
    game_id: z.int(),
    home: z.int().nullable(),
    away: z.int().nullable(),
    origin: z.string(),
  }),
);

const predictions = async () =>
  rowsOf.parse(
    (
      await client.query(
        'select game_id, home, away, origin from match_predictions where player_id = 9 order by game_id',
      )
    ).rows,
  );

const count = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (
        await client.query(
          `select count(*)::int as rows from ${table} where player_id = 9`,
        )
      ).rows,
    )[0]?.rows;

const join = (now: string, rules: RuleSet) =>
  registerForTournament(db, {
    player: JONAS,
    tournament: TOURNAMENT,
    rules,
    now: at(now),
    dice: seededDice(7),
  });

beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [testPlayer(JONAS, 'jonas')]);
  // 7 scored (10-02), 9 postponed before its tip-off, 10 locked after a
  // move (10-03), 11 still to come.
  await saveGames(db, TOURNAMENT, [G7, G9, G10, G11]);
});

describe('registerForTournament', () => {
  it('joining: a newcomer gets their place, a blank row per game and a standings row per team, once', async () => {
    expect(await join('2026-10-01T12:00:00Z', sportbetRules)).toEqual({
      ok: true,
      value: { newcomer: true, lateFillIns: 0 },
    });
    const blank = (game: number) => ({
      game_id: game,
      home: null,
      away: null,
      origin: 'real',
    });
    expect(await predictions()).toEqual([
      blank(7),
      blank(9),
      blank(10),
      blank(11),
    ]);
    expect(await count('standings_predictions')).toBe(4);
    expect(
      (
        await client.query(
          'select tournament_id, switched_off, admin_hidden, fill_ins from tournament_players where player_id = 9',
        )
      ).rows,
    ).toEqual([
      {
        tournament_id: TOURNAMENT.id,
        switched_off: false,
        admin_hidden: false,
        fill_ins: 0,
      },
    ]);
    // Joining again changes nothing (PredictionRows::seedMissing).
    expect(await join('2026-10-01T13:00:00Z', sportbetRules)).toEqual({
      ok: true,
      value: { newcomer: false, lateFillIns: 0 },
    });
    expect(await count('match_predictions')).toBe(4);
    expect(await count('standings_predictions')).toBe(4);
    expect(await count('tournament_players')).toBe(1);
  });

  it('joining (sportbet): refused from the first game on, and nothing is written', async () => {
    expect(await join('2026-10-03T12:00:00Z', sportbetRules)).toEqual({
      ok: false,
      refusal: 'registration-closed',
    });
    expect(await count('tournament_players')).toBe(0);
    expect(await count('match_predictions')).toBe(0);
    expect(await count('standings_predictions')).toBe(0);
  });

  it('late joiner (ruled): the games already played are filled in and scored through the recalculation, the rest blank (R-9)', async () => {
    expect(await join('2026-10-12T12:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: true, lateFillIns: 2 },
    });
    const rows = await predictions();
    expect(rows.map(({ game_id, origin }) => [game_id, origin])).toEqual([
      [7, 'late-fill-in'],
      [9, 'real'],
      [10, 'late-fill-in'],
      [11, 'real'],
    ]);
    expect(
      rows
        .filter(({ origin }) => origin === 'late-fill-in')
        .every(({ home, away }) => home !== null && away !== null),
    ).toBe(true);
    // Game 7 has a result: its fill-in is scored, under the ruled source only.
    const ruled = await loadTournamentPoints(db, TOURNAMENT, 'ruled');
    expect(ruled.matches.map(({ player: who, game }) => [who, game])).toEqual([
      [JONAS, gameNo(7)],
    ]);
    const sportbet = await loadTournamentPoints(db, TOURNAMENT, 'sportbet');
    expect(sportbet.matches).toEqual([]);
    // R-9: fill-ins at joining do not count toward being switched off (R-7).
    expect(
      (
        await client.query(
          'select fill_ins from tournament_players where player_id = 9',
        )
      ).rows,
    ).toEqual([{ fill_ins: 0 }]);
  });

  it('joining again fills nobody in: a player already in is no late joiner', async () => {
    await join('2026-10-01T12:00:00Z', sportbetRules);
    expect(await join('2026-10-12T12:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: false, lateFillIns: 0 },
    });
    expect((await predictions()).every(({ origin }) => origin === 'real')).toBe(
      true,
    );
  });
});

it('loadJoinCandidates: every tournament with its season, by id', async () => {
  await saveTournament(db, OTHER);
  const candidates = await loadJoinCandidates(db);
  expect(
    candidates.map(({ tournament, season }) => [
      tournament.slug,
      season.games.map(({ id }) => id),
    ]),
  ).toEqual([
    [TOURNAMENT.slug, [gameNo(7), gameNo(9), gameNo(10), gameNo(11)]],
    [OTHER.slug, []],
  ]);
});

// The guest pages ask whether registration is open on every visit: one
// summary row per tournament, never its games.
describe('isRegistrationOpen (ChecksRegistrationDeadline::anyTournamentIsJoinable)', () => {
  it('sums each tournament up as its season does, without loading the season', async () => {
    // The world's round 2 as the deadline round, so the standings deadline
    // is game 9's tip-off; OTHER has no end date and no games.
    await saveTournament(db, {
      ...TOURNAMENT,
      standingsDeadlineRound: roundNo(2),
    });
    await saveTournament(db, { ...OTHER, endsOn: null });
    const windows = await loadRegistrationWindows(db);
    expect(windows).toEqual(
      (await loadJoinCandidates(db)).map(({ season }) =>
        season.registrationWindow(),
      ),
    );
    expect([...(await loadRegistrationWindowsById(db)).keys()]).toEqual([
      TOURNAMENT.id,
      OTHER.id,
    ]);
    expect(windows).toEqual([
      {
        endsAt: at('2027-05-24T00:00:00Z'),
        games: 4,
        allScored: false,
        firstTipOff: at('2026-10-02T18:00:00Z'),
        standingsDeadline: at('2026-10-10T17:30:00Z'),
      },
      {
        endsAt: null,
        games: 0,
        allScored: true,
        firstTipOff: null,
        standingsDeadline: null,
      },
    ]);
  });

  it('registration (sportbet): open before the first game, closed once every tournament has started', async () => {
    expect(
      await isRegistrationOpen(db, at('2026-10-01T12:00:00Z'), sportbetRules),
    ).toBe(true);
    expect(
      await isRegistrationOpen(db, at('2026-10-03T12:00:00Z'), sportbetRules),
    ).toBe(false);
  });

  it('registration (ruled): open until the standings deadline (R-8), and while a tournament with no games waits', async () => {
    expect(
      await isRegistrationOpen(db, at('2026-10-12T12:00:00Z'), ruledRules),
    ).toBe(true);
    await saveTournament(db, {
      ...TOURNAMENT,
      standingsDeadlineRound: roundNo(2),
    });
    expect(
      await isRegistrationOpen(db, at('2026-10-12T12:00:00Z'), ruledRules),
    ).toBe(false);
    await saveTournament(db, OTHER);
    expect(
      await isRegistrationOpen(db, at('2026-10-12T12:00:00Z'), ruledRules),
    ).toBe(true);
  });
});

describe('R-50: sign-up and a non-public tournament', () => {
  it('R-50: a join candidate carries its public switch', async () => {
    await saveTournamentProfile(db, TOURNAMENT, {
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: false,
    });
    expect(
      (await loadJoinCandidates(db)).map(({ tournament, isPublic }) => [
        tournament.id,
        isPublic,
      ]),
    ).toEqual([[TOURNAMENT.id, false]]);
  });

  it('R-50: registration is closed under ruled when only a non-public tournament takes players, and open under sportbet', async () => {
    await saveTournamentProfile(db, TOURNAMENT, {
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: false,
    });
    // Before game 7, the first: it takes players under both sets (no
    // round-5 game sets the ruled deadline).
    const before = at('2026-10-01T12:00:00Z');
    expect(await isRegistrationOpen(db, before, ruledRules)).toBe(false);
    expect(await isRegistrationOpen(db, before, sportbetRules)).toBe(true);
  });
});
