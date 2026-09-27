import { afterAll, beforeEach, expect, inject, it } from 'vitest';
import { createDb, listTournaments } from '../src';
import { STAGING_TOURNAMENTS, seedStaging } from '../src/seed/staging';
import { truncateAll } from '../src/testing';

const { db, close } = createDb(inject('databaseUrl'));

afterAll(close);
beforeEach(() => truncateAll(db));

it('seeds the staging tournaments, and running it again adds nothing', async () => {
  await seedStaging(db);
  await seedStaging(db);
  const listed = (await listTournaments(db)).map(({ slug, name, format }) => ({
    slug,
    name,
    format,
  }));
  expect(listed).toEqual([...STAGING_TOURNAMENTS]);
});
