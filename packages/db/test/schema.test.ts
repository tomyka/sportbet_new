import { FORMATS } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase } from '../src/testing';

const { url, client } = useTestDatabase();

const insert = (slug: string, name: string, format: string) =>
  client.query(
    'insert into tournaments (slug, name, format) values ($1, $2, $3)',
    [slug, name, format],
  );

// The invariant CHECKs are tested in invariant-checks.test.ts.
describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insert('euroleague-2026-27', 'Euroleague 2026/27', 'euroleague'),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown format', async () => {
    await expect(
      insert('euroleague-2026-27', 'Euroleague 2026/27', 'tennis'),
    ).rejects.toMatchObject({
      code: '22P02',
    });
  });

  it('rejects a duplicate slug', async () => {
    await insert('euroleague-2026-27', 'Euroleague 2026/27', 'euroleague');
    await expect(
      insert('euroleague-2026-27', 'Other', 'euroleague'),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'tournaments_slug_unique',
    });
  });
});

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
