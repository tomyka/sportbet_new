// A runtime entry of its own (`@sportbet/db/migrations`), not part of the
// package's main entry: the web app's bundler would try to resolve
// `../migrations` below as a module, and the web app never migrates.
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/**
 * `migrations/` beside `src/` - and beside `dist/` in the migrate image, where
 * this file is bundled into dist/migrate.mjs, so the same relative path holds.
 * The production-copy reader's bundle (tools/migrate) gets a copy beside its
 * own `dist/` for the same reason.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

/**
 * The Postgres image every test suite and the production-copy reader run
 * on; staging's Compose file (infra/compose/app.yml) and
 * infra/host/backup.sh pin the same exact tag, bumped deliberately together
 * with the node tag in the Dockerfile.
 */
export const POSTGRES_IMAGE = 'postgres:18.6';

export async function runMigrations(
  url: string,
  migrationsFolder: string,
): Promise<void> {
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
