import { newTournamentSchema } from '@sportbet/domain';
import { expect, it } from 'vitest';
import { listTournaments } from '../src';
import { STAGING_TOURNAMENTS, seedStaging } from '../src/seed/staging';
import { useTestDatabase } from '../src/testing';

const { db } = useTestDatabase();

it('seeds the staging tournaments, and running it again adds nothing', async () => {
  await seedStaging(db);
  await seedStaging(db);
  // Each listed tournament without its generated id.
  const listed = (await listTournaments(db)).map((tournament) =>
    newTournamentSchema.parse(tournament),
  );
  expect(listed).toEqual([...STAGING_TOURNAMENTS]);
});
