import { FORMATS, NAME_NOT_BLANK_PATTERN } from '@sportbet/domain';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { createDb } from '../src';
import { MIGRATIONS_FOLDER, runMigrations, truncateAll } from '../src/testing';

const url = inject('databaseUrl');
// Db.$client isn't part of the exported Db type (drizzle only adds it to the
// factory's inferred return type, which createDb narrows away), so this stays
// a second, raw connection - hardened the same way createDb hardens its own.
const pool = new pg.Pool({
  connectionString: url,
  connectionTimeoutMillis: 5_000,
});
pool.on('error', (error) => {
  console.error('database pool: idle client error', error);
});
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
    ['no-break spaces', '\u00a0\u00a0'],
    ['a byte-order mark', '\ufeff'],
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

describe('name blank check', () => {
  it('agrees with the domain over every BMP code point', async () => {
    const result = await pool.query(
      "select coalesce(string_agg(n::text, ',' order by n), '') as blank " +
        'from generate_series(1, 65535) n ' +
        'where (n < 55296 or n > 57343) and chr(n) !~ $1',
      [NAME_NOT_BLANK_PATTERN],
    );
    // Code point 0 is excluded: Postgres text cannot hold NUL.
    const { blank } = z.object({ blank: z.string() }).parse(result.rows[0]);

    const jsBlank: number[] = [];
    for (let codePoint = 1; codePoint <= 65535; codePoint++) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogates
      if (/^\s$/.test(String.fromCharCode(codePoint))) jsBlank.push(codePoint);
    }

    expect(blank).toEqual(jsBlank.join(','));
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
