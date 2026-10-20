// TournamentRegistrationService::register and PredictionRows::seedMissing:
// a join writes the player's place and blank rows once, only while the
// tournament takes players; a late joiner is filled in and scored under
// ruledRules (R-9), never under sportbetRules.

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
import { loadTournamentCatalogue } from '../src/tournament/catalogue';
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
  it('joining: a newcomer gets their place, a row per game and a standings row per team, once', async () => {
    expect(await join('2026-10-01T12:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: true, lateFillIns: 2 },
    });
    expect((await predictions()).map(({ game_id }) => game_id)).toEqual([
      7, 9, 10, 11,
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
    const rows = await predictions();
    // Joining again changes nothing (PredictionRows::seedMissing).
    expect(await join('2026-10-01T13:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: false, lateFillIns: 0 },
    });
    expect(await predictions()).toEqual(rows);
    expect(await count('standings_predictions')).toBe(4);
    expect(await count('tournament_players')).toBe(1);
  });

  it('joining: a newcomer joins the tournament public league, created when there is none, and selects it (#29)', async () => {
    await join('2026-10-01T12:00:00Z', sportbetRules);
    await join('2026-10-01T13:00:00Z', sportbetRules);
    const league = async () =>
      z.array(z.record(z.string(), z.unknown())).parse(
        (
          await client.query(
            `select l.name, l.is_public, m.is_guest, m.is_admin,
                  tp.selected_league_id = l.id as selected,
                  (select count(*)::int from leagues) as leagues
           from tournament_players tp
           join leagues l on l.id = tp.selected_league_id
           join league_members m on m.league_id = l.id and m.player_id = tp.player_id
           where tp.player_id = 9`,
          )
        ).rows,
      );
    expect(await league()).toEqual([
      {
        name: TOURNAMENT.name,
        is_public: true,
        is_guest: false,
        is_admin: false,
        selected: true,
        leagues: 1,
      },
    ]);
  });

  it('joining: refused from the first game on, under either set, and nothing is written (R-128)', async () => {
    for (const rules of [sportbetRules, ruledRules]) {
      expect(await join('2026-10-03T12:00:00Z', rules)).toEqual({
        ok: false,
        refusal: 'registration-closed',
      });
    }
    expect(await count('tournament_players')).toBe(0);
    expect(await count('match_predictions')).toBe(0);
    expect(await count('standings_predictions')).toBe(0);
  });

  // Registration closes at the first game's start (R-128): a joiner meets
  // only games scored or locked ahead of their tip-off, as the world's are
  // before game 7 tips off.
  it('late joiner (ruled): the games scored or locked ahead of their tip-off are filled in and scored through the recalculation, the rest blank (R-9)', async () => {
    expect(await join('2026-10-01T12:00:00Z', ruledRules)).toEqual({
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
    await join('2026-10-01T12:00:00Z', ruledRules);
    const rows = await predictions();
    expect(await join('2026-10-01T13:00:00Z', ruledRules)).toEqual({
      ok: true,
      value: { newcomer: false, lateFillIns: 0 },
    });
    expect(await predictions()).toEqual(rows);
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
    // OTHER has no end date and no games.
    await saveTournament(db, TOURNAMENT);
    await saveTournament(db, { ...OTHER, endsOn: null });
    const catalogue = await loadTournamentCatalogue(db);
    const windows = catalogue.map(({ window }) => window);
    expect(windows).toEqual(
      (await loadJoinCandidates(db)).map(({ season }) =>
        season.registrationWindow(),
      ),
    );
    expect(catalogue.map(({ tournament }) => tournament.id)).toEqual([
      TOURNAMENT.id,
      OTHER.id,
    ]);
    expect(windows).toEqual([
      {
        endsAt: at('2027-05-24T00:00:00Z'),
        games: 4,
        allScored: false,
        firstTipOff: at('2026-10-02T18:00:00Z'),
      },
      {
        endsAt: null,
        games: 0,
        allScored: true,
        firstTipOff: null,
      },
    ]);
  });

  it('registration: open before the first game, closed once every tournament has started, under both sets (R-128)', async () => {
    for (const rules of [sportbetRules, ruledRules]) {
      expect(
        await isRegistrationOpen(db, at('2026-10-01T12:00:00Z'), rules),
      ).toBe(true);
      expect(
        await isRegistrationOpen(db, at('2026-10-03T12:00:00Z'), rules),
      ).toBe(false);
    }
  });

  it('registration: a tournament with no games keeps it open once the others have started', async () => {
    await saveTournament(db, OTHER);
    for (const rules of [sportbetRules, ruledRules]) {
      expect(
        await isRegistrationOpen(db, at('2026-10-12T12:00:00Z'), rules),
      ).toBe(true);
    }
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
    // Before game 7, the first: it takes players under both sets.
    const before = at('2026-10-01T12:00:00Z');
    expect(await isRegistrationOpen(db, before, ruledRules)).toBe(false);
    expect(await isRegistrationOpen(db, before, sportbetRules)).toBe(true);
  });
});
