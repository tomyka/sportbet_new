import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestDatabase } from '@sportbet/db/testing';
import type { TestProject } from 'vitest/node';
import { appEnv, startServer, type RunningServer } from '../support/app';
import { startMailCatcher } from '../support/mail-catcher';

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  const mail = await startMailCatcher();
  // What the server prints, for tests that check nothing personal is logged.
  const logDir = mkdtempSync(join(tmpdir(), 'sportbet-feature-'));
  const serverLogPath = join(logDir, 'server.log');
  let server: RunningServer;
  try {
    server = await startServer(appEnv(database.url, mail.url), serverLogPath);
  } catch (error) {
    await mail.stop();
    await database.stop();
    rmSync(logDir, { recursive: true, force: true });
    throw error;
  }
  project.provide('databaseUrl', database.url);
  project.provide('baseUrl', server.url);
  project.provide('mailpitUrl', mail.url);
  project.provide('serverLogPath', serverLogPath);
  return async () => {
    await server.stop();
    await mail.stop();
    await database.stop();
    rmSync(logDir, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    mailpitUrl: string;
    serverLogPath: string;
  }
}
