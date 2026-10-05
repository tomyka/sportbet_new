import { startTestDatabase } from '@sportbet/db/testing';
import type { TestProject } from 'vitest/node';
import { appEnv, startServer, type RunningServer } from '../support/app';
import { startMailCatcher } from '../support/mail-catcher';

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  const mail = await startMailCatcher();
  let server: RunningServer;
  try {
    server = await startServer(appEnv(database.url, mail.url));
  } catch (error) {
    await mail.stop();
    await database.stop();
    throw error;
  }
  project.provide('databaseUrl', database.url);
  project.provide('baseUrl', server.url);
  project.provide('mailpitUrl', mail.url);
  return async () => {
    await server.stop();
    await mail.stop();
    await database.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    mailpitUrl: string;
  }
}
