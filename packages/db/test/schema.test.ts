import { FORMATS } from '@sportbet/domain';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase } from '../src/testing';

const { url, client } = useTestDatabase();

const run = (text: string, values: readonly unknown[] = []) =>
  client.query(text, [...values]);

const UNIQUE = '23505';

const insertTournament = (id: number, slug: string) =>
  run(
    `insert into tournaments (id, slug, name, format, ends_on, survival)
     overriding system value values ($1, $2, $2, 'euroleague', '2027-05-23', true)`,
    [id, slug],
  );

// The invariant CHECKs are tested in invariant-checks.test.ts.
describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insertTournament(1, 'euroleague-2026-27'),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown format', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, ends_on, survival)
         values ('euroleague-2026-27', 'Euroleague', 'tennis', '2027-05-23', true)`,
      ),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('rejects a duplicate slug', async () => {
    await insertTournament(1, 'euroleague-2026-27');
    await expect(
      insertTournament(2, 'euroleague-2026-27'),
    ).rejects.toMatchObject({
      code: UNIQUE,
      constraint: 'tournaments_slug_unique',
    });
  });

  it('rejects a tournament without an end date', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, survival)
         values ('euroleague-2026-27', 'Euroleague', 'euroleague', true)`,
      ),
    ).rejects.toMatchObject({ code: '23502', column: 'ends_on' });
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

  it("give staging's seeded tournaments the seed's end dates when the season columns arrive", async () => {
    // A second database in the same container, migrated to 0000_init only,
    // holding the two rows staging holds today.
    const name = `backfill_${String(process.pid)}`;
    await run(`drop database if exists ${name}`);
    await run(`create database ${name}`);
    const other = new URL(url);
    other.pathname = `/${name}`;
    const initOnly = mkdtempSync(join(tmpdir(), 'migrations-'));
    mkdirSync(join(initOnly, 'meta'));
    copyFileSync(
      join(MIGRATIONS_FOLDER, '0000_init.sql'),
      join(initOnly, '0000_init.sql'),
    );
    const journal = z
      .object({ entries: z.array(z.object({ tag: z.string() }).loose()) })
      .loose()
      .parse(
        JSON.parse(
          readFileSync(
            join(MIGRATIONS_FOLDER, 'meta', '_journal.json'),
            'utf8',
          ),
        ),
      );
    writeFileSync(
      join(initOnly, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );
    await runMigrations(other.href, initOnly);
    const staging = new pg.Client({ connectionString: other.href });
    await staging.connect();
    try {
      await staging.query(
        `insert into tournaments (slug, name, format) values
           ('euroleague-2025-26', 'Euroleague 2025/26', 'euroleague'),
           ('euroleague-2026-27', 'Euroleague 2026/27', 'euroleague')`,
      );
      await runMigrations(other.href, MIGRATIONS_FOLDER);
      const result = await staging.query(
        `select slug, ends_on::text as ends_on, survival, standings_table_final
         from tournaments order by slug`,
      );
      expect(result.rows).toEqual([
        {
          slug: 'euroleague-2025-26',
          ends_on: '2026-05-24',
          survival: true,
          standings_table_final: false,
        },
        {
          slug: 'euroleague-2026-27',
          ends_on: '2027-05-23',
          survival: true,
          standings_table_final: false,
        },
      ]);
    } finally {
      await staging.end();
      await run(`drop database ${name}`);
    }
  });
});
