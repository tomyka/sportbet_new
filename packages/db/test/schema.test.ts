import {
  FORMATS,
  slugInvariant,
  tournamentNameInvariant,
} from '@sportbet/domain';
import { everyBmpCharacter } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { tournaments } from '../src/schema';
import { describeInvariantCheck, useTestDatabase } from '../src/testing';

const { url, client } = useTestDatabase();

const insert = (slug: string, name: string, format: string) =>
  client.query(
    'insert into tournaments (slug, name, format) values ($1, $2, $3)',
    [slug, name, format],
  );

describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insert('euro-2028', 'Euro 2028', 'football'),
    ).resolves.toBeDefined();
  });

  it('refuses a row that breaks an invariant, naming its CHECK', async () => {
    await expect(
      insert('Euro 2028', 'Euro 2028', 'football'),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'tournaments_slug_format',
    });
  });

  it('rejects an unknown format', async () => {
    await expect(
      insert('euro-2028', 'Euro 2028', 'tennis'),
    ).rejects.toMatchObject({
      code: '22P02',
    });
  });

  it('rejects a duplicate slug', async () => {
    await insert('euro-2028', 'Euro 2028', 'football');
    await expect(
      insert('euro-2028', 'Other', 'football'),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'tournaments_slug_unique',
    });
  });
});

describeInvariantCheck(client, {
  invariant: slugInvariant,
  column: tournaments.slug,
  constraint: 'tournaments_slug_format',
});

// Every BMP character too: the one place the two regex dialects are proven
// to draw the blank-name line on exactly the same code points.
describeInvariantCheck(
  client,
  {
    invariant: tournamentNameInvariant,
    column: tournaments.name,
    constraint: 'tournaments_name_not_blank',
  },
  everyBmpCharacter(),
);

describe('format enum', () => {
  it('holds exactly the domain formats, in order', async () => {
    const result = await client.query(
      'select unnest(enum_range(null::format))::text as value',
    );
    const values = z
      .array(z.object({ value: z.string() }))
      .parse(result.rows)
      .map((row) => row.value);
    expect(values).toEqual([...FORMATS]);
  });
});

describe('migrations', () => {
  it('are idempotent: applying them again changes nothing', async () => {
    await expect(
      runMigrations(url, MIGRATIONS_FOLDER),
    ).resolves.toBeUndefined();
  });
});
