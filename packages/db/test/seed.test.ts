import { emailAddress, newTournamentSchema } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { listPlayers, listPlayerSettings, listTournaments } from '../src';
import {
  STAGING_ACCOUNT,
  STAGING_TOURNAMENTS,
  seedStaging,
} from '../src/seed/staging';
import { useTestDatabase } from '../src/testing';

const { db, client } = useTestDatabase();

const OWNER = unwrap(emailAddress('owner@example.test'));

it('seeds the staging tournaments, and running it again adds nothing', async () => {
  await seedStaging(db, null);
  await seedStaging(db, null);
  // Each listed tournament without its generated id.
  const listed = (await listTournaments(db)).map((tournament) =>
    newTournamentSchema.parse(tournament),
  );
  expect(listed).toEqual([...STAGING_TOURNAMENTS]);
  expect(await listPlayers(db)).toEqual([]);
});

it('seeds one account with the address given, playing Euroleague 2026/27, and running it again keeps one with the newest address', async () => {
  await seedStaging(db, OWNER);
  await seedStaging(db, unwrap(emailAddress('owner2@example.test')));
  const players = await listPlayers(db);
  expect(players).toMatchObject([
    {
      username: STAGING_ACCOUNT.username,
      email: 'owner2@example.test',
      name: STAGING_ACCOUNT.name,
      surname: STAGING_ACCOUNT.surname,
    },
  ]);
  expect(await listPlayerSettings(db)).toMatchObject([
    { locale: 'lt', adminLevel: 0, lastTournament: null },
  ]);
  const playing = await client.query(
    `select t.slug from tournament_players tp join tournaments t on t.id = tp.tournament_id`,
  );
  expect(z.array(z.object({ slug: z.string() })).parse(playing.rows)).toEqual([
    { slug: STAGING_ACCOUNT.plays },
  ]);
});
