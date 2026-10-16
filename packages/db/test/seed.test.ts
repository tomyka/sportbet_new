import { emailAddress, newTournamentSchema } from '@sportbet/domain';
import { at, player, testPlayer, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  listPlayers,
  listPlayerSettings,
  loadTournamentCatalogue,
  savePlayers,
  savePlayerSettings,
} from '../src';
import {
  STAGING_ACCOUNT,
  STAGING_TOURNAMENTS,
  seedEnvironmentAllowed,
  seedStaging,
} from '../src/seed/staging';
import { STAGING_LEAGUES } from '../src/seed/staging-leagues';
import { PROBE_GAME, probeTipOff } from '../src/seed/staging-probe';
import { setReceiveReminders } from '../src';
import { rowsOf } from './world';
import { useTestDatabase } from '../src/testing';

const { db, client } = useTestDatabase();

const OWNER = unwrap(emailAddress('owner@example.test'));

it('seeds the staging tournaments with their profiles, 2026/27 its game to come and its started one, and running it again adds nothing', async () => {
  await seedStaging(db, null);
  await seedStaging(db, null);
  // Each tournament without its generated id, with its profile, by id: the
  // order the seed inserts them in.
  const seeded = (await loadTournamentCatalogue(db)).map(
    ({ tournament, profile }) => ({
      tournament: newTournamentSchema.parse(tournament),
      profile,
    }),
  );
  expect(seeded).toEqual(STAGING_TOURNAMENTS);
  const games = await client.query('select id from games order by id');
  expect(z.array(z.object({ id: z.int() })).parse(games.rows)).toEqual([
    { id: 9001 },
    { id: 9002 },
    { id: 9003 },
    { id: 9004 },
  ]);
  // Round 1 plays survival, with game 9004 still to pick on (slice 10).
  const rounds = await client.query(
    'select id, survival from rounds where id in (9001, 9005) order by id',
  );
  expect(rounds.rows).toEqual([
    { id: 9001, survival: true },
    { id: 9005, survival: false },
  ]);
  expect(await listPlayers(db)).toEqual([]);
});

it('seeds one account with the address given, playing Euroleague 2026/27, and running it again with that address keeps one', async () => {
  await seedStaging(db, OWNER);
  await seedStaging(db, OWNER);
  const players = await listPlayers(db);
  expect(players.map(({ username }) => username)).toEqual([
    STAGING_ACCOUNT.username,
    STAGING_LEAGUES.member.username,
    STAGING_LEAGUES.guest.username,
  ]);
  expect(players[0]).toMatchObject({
    email: 'owner@example.test',
    name: STAGING_ACCOUNT.name,
    surname: STAGING_ACCOUNT.surname,
  });
  expect(
    (await listPlayerSettings(db)).map(({ role }) => role).toSorted(),
  ).toEqual(['player', 'player', 'superadmin']);
  const playing = await client.query(
    `select t.slug from tournament_players tp join tournaments t on t.id = tp.tournament_id`,
  );
  expect(z.array(z.object({ slug: z.string() })).parse(playing.rows)).toEqual(
    Array.from({ length: 3 }, () => ({ slug: STAGING_ACCOUNT.plays })),
  );
  // A blank row per game of 2026/27, as joining writes, so the owner can predict.
  const rows = await client.query(
    'select game_id, home, away, origin from match_predictions order by game_id',
  );
  expect(rows.rows).toEqual([
    { game_id: 9001, home: null, away: null, origin: 'real' },
    { game_id: 9002, home: null, away: null, origin: 'real' },
    { game_id: 9003, home: null, away: null, origin: 'real' },
    { game_id: 9004, home: null, away: null, origin: 'real' },
  ]);
});

it('seed: the staging account is a superadmin, and stays one (R-26 amended)', async () => {
  await seedStaging(db, OWNER);
  await seedStaging(db, OWNER);
  const rows = await client.query(
    "select role::text as role from player_settings join players on players.id = player_settings.player_id where players.username = 'savininkas'",
  );
  expect(rows.rows).toEqual([{ role: 'superadmin' }]);
});

it('seed: the staging account under another address is refused, not taken over or moved', async () => {
  await seedStaging(db, OWNER);
  await expect(
    seedStaging(db, unwrap(emailAddress('owner2@example.test'))),
  ).rejects.toThrow(
    'seed: the staging username already belongs to another address',
  );
  expect((await listPlayers(db)).map(({ email }) => email)).toContain(
    'owner@example.test',
  );
});

it('seed: an address another account holds is refused, and that account is not made a superadmin', async () => {
  await savePlayers(db, [testPlayer(player('77'), 'someone')]);
  await savePlayerSettings(db, [
    {
      player: player('77'),
      locale: 'lt',
      role: 'player',
      lastTournament: null,
    },
  ]);
  await expect(
    seedStaging(db, unwrap(emailAddress('someone@example.test'))),
  ).rejects.toThrow(
    'seed: the staging address already belongs to another account',
  );
  expect(await listPlayerSettings(db)).toMatchObject([{ role: 'player' }]);
  expect((await listPlayers(db)).map(({ username }) => username)).toEqual([
    'someone',
  ]);
});

it.each([
  [undefined, false],
  ['local', true],
  ['ci', true],
  ['staging', true],
  ['production', false],
  ['prod', false],
  ['', false],
] as const)('seed: SPORTBET_ENV %s lets the seed run: %s', (value, allowed) => {
  expect(seedEnvironmentAllowed(value)).toBe(allowed);
});

it('seed: the tournament has its public league under a fixed id, and a private league the owner owns and selects, with a full member and a guest (#29)', async () => {
  await seedStaging(db, OWNER);
  await seedStaging(db, OWNER);
  const leagues = await client.query(
    'select id, name, is_public, owner_id from leagues order by id',
  );
  const owner = (await listPlayers(db))[0]?.id;
  expect(leagues.rows).toEqual([
    {
      id: 9001,
      name: 'Euroleague 2026/27',
      is_public: true,
      owner_id: null,
    },
    {
      id: 9002,
      name: 'Draugų lyga',
      is_public: false,
      owner_id: Number(owner),
    },
  ]);
  const members = await client.query(
    `select p.username, m.league_id, m.is_admin, m.is_guest,
            tp.selected_league_id = m.league_id as selected
     from league_members m
     join players p on p.id = m.player_id
     join tournament_players tp on tp.player_id = m.player_id
     order by m.league_id, p.username`,
  );
  expect(members.rows).toEqual([
    {
      username: 'savininkas',
      league_id: 9001,
      is_admin: false,
      is_guest: false,
      selected: false,
    },
    {
      username: 'svecias',
      league_id: 9001,
      is_admin: false,
      is_guest: false,
      selected: true,
    },
    {
      username: 'zaidejas',
      league_id: 9001,
      is_admin: false,
      is_guest: false,
      selected: true,
    },
    {
      username: 'savininkas',
      league_id: 9002,
      is_admin: true,
      is_guest: false,
      selected: true,
    },
    {
      username: 'svecias',
      league_id: 9002,
      is_admin: false,
      is_guest: true,
      selected: false,
    },
    {
      username: 'zaidejas',
      league_id: 9002,
      is_admin: false,
      is_guest: false,
      selected: false,
    },
  ]);
});

it('seed: a public league the tournament already has (migration 0018 leaves one, with a generated id) is found and used, and no second one is made', async () => {
  await seedStaging(db, null);
  const id = z
    .array(z.object({ id: z.int() }))
    .parse(
      (
        await client.query(
          "select id from tournaments where slug = 'euroleague-2026-27'",
        )
      ).rows,
    )[0]?.id;
  await client.query(
    `insert into leagues (tournament_id, name, is_public) values ($1, 'Euroleague 2026/27', true)`,
    [id],
  );
  const generated = await client.query(
    'select id from leagues where is_public',
  );
  await seedStaging(db, OWNER);
  await seedStaging(db, OWNER);
  const publics = await client.query(
    'select id from leagues where is_public and tournament_id = $1',
    [id],
  );
  expect(publics.rows).toEqual(generated.rows);
  expect(publics.rows).not.toEqual([{ id: 9001 }]);
  const members = await client.query(
    'select count(*)::int as n from league_members where league_id = $1',
    [z.array(z.object({ id: z.int() })).parse(publics.rows)[0]?.id],
  );
  expect(members.rows).toEqual([{ n: 3 }]);
  const privateLeagues = await client.query(
    'select id from leagues where not is_public',
  );
  expect(privateLeagues.rows).toEqual([{ id: 9002 }]);
});

it('seed: on an empty database the public league gets the fixed id 9001', async () => {
  await seedStaging(db, OWNER);
  const publics = await client.query('select id from leagues where is_public');
  expect(publics.rows).toEqual([{ id: 9001 }]);
});

const optedIn = async () =>
  rowsOf(
    await client.query(
      "select p.username, s.receive_reminders from player_settings s join players p on p.id = s.player_id where p.username = 'savininkas'",
    ),
  );

const probe = async () =>
  rowsOf(
    await client.query(
      'select tip_off, home_score, locked_since from games where id = $1',
      [PROBE_GAME.id],
    ),
  );

it('seed: the staging account is opted in to prediction reminders when it is made, and a later seed leaves its choice (slice 16)', async () => {
  await seedStaging(db, OWNER);
  expect(await optedIn()).toEqual([
    { username: 'savininkas', receive_reminders: true },
  ]);
  const owner = (await listPlayers(db))[0]?.id;
  if (owner === undefined) throw new Error('no owner was seeded');
  await setReceiveReminders(db, { player: owner, on: false });
  await seedStaging(db, OWNER);
  expect(await optedIn()).toEqual([
    { username: 'savininkas', receive_reminders: false },
  ]);
});

describe('probeTipOff', () => {
  it.each([
    // 11:00 Vilnius (UTC+3): today 19:00 is 8 h ahead.
    ['2026-10-16T08:00:00Z', '2026-10-16T16:00:00Z'],
    // Exactly three hours before 19:00: still today's.
    ['2026-10-16T13:00:00Z', '2026-10-16T16:00:00Z'],
    // Two hours 59 minutes before: tomorrow's.
    ['2026-10-16T13:00:01Z', '2026-10-17T16:00:00Z'],
    // After 19:00: tomorrow's.
    ['2026-10-16T17:00:00Z', '2026-10-17T16:00:00Z'],
    // 23:00 Vilnius on the eve of the clocks going back (2026-10-25, 04:00):
    // the next 19:00 is winter time (UTC+2).
    ['2026-10-24T20:00:00Z', '2026-10-25T17:00:00Z'],
    // The eve of the clocks going forward (2027-03-28, 03:00).
    ['2027-03-27T20:00:00Z', '2027-03-28T16:00:00Z'],
  ])(
    'is the next 19:00 Vilnius at least three hours after %s: %s',
    (now, expected) => {
      expect(probeTipOff(at(now))).toBe(at(expected));
    },
  );
});

describe('the probe game', () => {
  it('is staging only: no clock, no game', async () => {
    await seedStaging(db, OWNER);
    expect(await probe()).toEqual([]);
  });

  it('is made dated the next 19:00 Vilnius at least three hours ahead, with a blank row for each player and the owner opted in', async () => {
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T08:00:00Z') });
    expect(await probe()).toEqual([
      {
        tip_off: new Date('2026-10-16T16:00:00Z'),
        home_score: null,
        locked_since: null,
      },
    ]);
    const rows = await client.query(
      'select count(*)::int as n from match_predictions where game_id = $1 and home is null and away is null',
      [PROBE_GAME.id],
    );
    expect(rows.rows).toEqual([{ n: 3 }]);
    expect(await optedIn()).toEqual([
      { username: 'savininkas', receive_reminders: true },
    ]);
  });

  it('opts in an account an earlier seed made, the first time only', async () => {
    await seedStaging(db, OWNER);
    await client.query('update player_settings set receive_reminders = false');
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T08:00:00Z') });
    expect(await optedIn()).toEqual([
      { username: 'savininkas', receive_reminders: true },
    ]);
    await client.query('update player_settings set receive_reminders = false');
    await seedStaging(db, OWNER, { probeAt: at('2026-10-17T08:00:00Z') });
    expect(await optedIn()).toEqual([
      { username: 'savininkas', receive_reminders: false },
    ]);
  });

  it('moves forward on a second seed, clears the old reminder and leaves the predictions', async () => {
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T08:00:00Z') });
    await client.query(
      'update match_predictions set home = 80, away = 70 where game_id = $1 and player_id = (select id from players where username = $2)',
      [PROBE_GAME.id, 'savininkas'],
    );
    await client.query(
      'update match_predictions set reminded_at = now() where game_id = $1',
      [PROBE_GAME.id],
    );
    await seedStaging(db, OWNER, { probeAt: at('2026-10-17T08:00:00Z') });
    expect(await probe()).toEqual([
      {
        tip_off: new Date('2026-10-17T16:00:00Z'),
        home_score: null,
        locked_since: null,
      },
    ]);
    const rows = await client.query(
      'select home, away, reminded_at is not null as reminded from match_predictions where game_id = $1 order by player_id',
      [PROBE_GAME.id],
    );
    expect(rowsOf(rows).map(({ reminded }) => reminded)).toEqual([
      false,
      false,
      false,
    ]);
    expect(rows.rows).toContainEqual({ home: 80, away: 70, reminded: false });
  });

  it('keeps its reminder when a second seed dates it the same', async () => {
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T08:00:00Z') });
    await client.query(
      'update match_predictions set reminded_at = now() where game_id = $1',
      [PROBE_GAME.id],
    );
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T09:00:00Z') });
    const rows = await client.query(
      'select count(*)::int as n from match_predictions where game_id = $1 and reminded_at is not null',
      [PROBE_GAME.id],
    );
    expect(rows.rows).toEqual([{ n: 3 }]);
  });

  it('is left alone once it has a result', async () => {
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T08:00:00Z') });
    await client.query(
      'update games set home_score = 90, away_score = 80 where id = $1',
      [PROBE_GAME.id],
    );
    await seedStaging(db, OWNER, { probeAt: at('2026-10-20T08:00:00Z') });
    expect(await probe()).toEqual([
      {
        tip_off: new Date('2026-10-16T16:00:00Z'),
        home_score: 90,
        locked_since: null,
      },
    ]);
  });

  it('is not in the other games of the season: 9001 to 9004 are as they were', async () => {
    await seedStaging(db, OWNER, { probeAt: at('2026-10-16T08:00:00Z') });
    const ids = await client.query('select id from games order by id');
    expect(ids.rows).toEqual([
      { id: 9001 },
      { id: 9002 },
      { id: 9003 },
      { id: 9004 },
      { id: 9010 },
    ]);
  });
});
