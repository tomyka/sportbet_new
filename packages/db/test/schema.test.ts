import { FORMATS } from '@sportbet/domain';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { createDb } from '../src';
import { MIGRATIONS_FOLDER, runMigrations, truncateAll } from '../src/testing';

const url = inject('databaseUrl');
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);

afterAll(async () => {
  await pool.end();
  await close();
});
beforeEach(() => truncateAll(db));

const insert = (slug: string, name: string, format: string) =>
  pool.query(
    'insert into tournaments (slug, name, format) values ($1, $2, $3)',
    [slug, name, format],
  );

describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insert('euro-2028', 'Euro 2028', 'football'),
    ).resolves.toBeDefined();
  });

  it.each([
    ['an uppercase slug', 'Euro-2028'],
    ['a slug with a space', 'euro 2028'],
    ['a 101-character slug', 'a'.repeat(101)],
  ])('rejects %s', async (_, slug) => {
    await expect(insert(slug, 'Euro 2028', 'football')).rejects.toMatchObject({
      code: '23514',
      constraint: 'tournaments_slug_format',
    });
  });

  // The same inputs the domain tests reject: the two sides must agree.
  it.each([
    ['spaces', '   '],
    ['no-break spaces', '  '],
    ['a byte-order mark', '﻿'],
  ])('rejects a name of only %s', async (_, name) => {
    await expect(insert('euro-2028', name, 'football')).rejects.toMatchObject({
      code: '23514',
      constraint: 'tournaments_name_not_blank',
    });
  });

  it('accepts a name with leading and trailing spaces, as the domain does', async () => {
    await expect(
      insert('euro-2028', '  Euro 2028  ', 'football'),
    ).resolves.toBeDefined();
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

describe('format enum', () => {
  it('holds exactly the domain formats, in order', async () => {
    const result = await pool.query(
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
