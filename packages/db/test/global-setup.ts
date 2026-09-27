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
  try {
    const url = container.getConnectionUri();
    await runMigrations(url, MIGRATIONS_FOLDER);
    project.provide('databaseUrl', url);
  } catch (error) {
    // A container that starts but never gets used must not leak past setup.
    await container.stop();
    throw error;
  }
  return async () => {
    await container.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
