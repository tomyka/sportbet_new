import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrations';
import type { TestDatabaseConnection } from './database';

const journalSchema = z
  .object({ entries: z.array(z.object({ tag: z.string() }).loose()) })
  .loose();

/** A database as it stood before the later migrations. */
export interface DatabaseAtMigration {
  readonly url: string;
  readonly client: pg.Client;
}

let made = 0;

/**
 * A second database beside the suite's (`useTestDatabase`), migrated
 * through the first `count` migrations only, handed to `use` with a client
 * of its own and dropped afterwards, whether `use` succeeds or not: for a
 * test of what a later migration does to rows an earlier one held.
 */
export async function withDatabaseAt(
  suite: TestDatabaseConnection,
  count: number,
  use: (database: DatabaseAtMigration) => Promise<void>,
): Promise<void> {
  made += 1;
  const name = `migrations_${String(process.pid)}_${String(made)}`;
  await suite.client.query(`drop database if exists ${name}`);
  await suite.client.query(`create database ${name}`);
  try {
    const url = new URL(suite.url);
    url.pathname = `/${name}`;
    await migrateThrough(url.href, count);
    const client = new pg.Client({ connectionString: url.href });
    await client.connect();
    try {
      await use({ url: url.href, client });
    } finally {
      await client.end();
    }
  } finally {
    await suite.client.query(`drop database ${name}`);
  }
}

/** Applies the first `count` migrations of MIGRATIONS_FOLDER to `url`. */
export async function migrateThrough(
  url: string,
  count: number,
): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'migrations-'));
  try {
    mkdirSync(join(folder, 'meta'));
    const journal = journalSchema.parse(
      JSON.parse(
        readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
      ),
    );
    const entries = journal.entries.slice(0, count);
    for (const { tag } of entries) {
      copyFileSync(
        join(MIGRATIONS_FOLDER, `${tag}.sql`),
        join(folder, `${tag}.sql`),
      );
    }
    writeFileSync(
      join(folder, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries }),
    );
    await runMigrations(url, folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
