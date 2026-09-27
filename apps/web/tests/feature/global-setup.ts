import type { TestProject } from 'vitest/node';
import { startDatabase, startServer } from '../support/app';

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const database = await startDatabase();
  const server = await startServer({
    DATABASE_URL: database.getConnectionUri(),
  });
  project.provide('databaseUrl', database.getConnectionUri());
  project.provide('baseUrl', server.url);
  return async () => {
    await server.stop();
    await database.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    databaseUrl: string;
  }
}
