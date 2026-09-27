import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import {
  MIGRATIONS_FOLDER,
  POSTGRES_IMAGE,
  runMigrations,
} from '../src/testing';

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();
  await runMigrations(url, MIGRATIONS_FOLDER);
  project.provide('databaseUrl', url);
  return async () => {
    await container.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
