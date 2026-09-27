import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/**
 * `migrations/` beside `src/` - and beside `dist/` in the migrate image, where
 * this file is bundled into dist/migrate.mjs, so the same relative path holds.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

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
