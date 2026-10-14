import { emailAddress, newTournamentSchema } from '@sportbet/domain';
import { player, testPlayer, unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
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
