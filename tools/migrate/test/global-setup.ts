import { startTestDatabase } from '@sportbet/db/testing';
import type { TestProject } from 'vitest/node';

// The migrated Postgres load.test.ts writes into. The end-to-end test starts
// its own containers through the reader, as a real run does.
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  project.provide('databaseUrl', database.url);
  return database.stop;
}
