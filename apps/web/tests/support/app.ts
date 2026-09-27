import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  MIGRATIONS_FOLDER,
  POSTGRES_IMAGE,
  runMigrations,
} from '@sportbet/db/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

const SERVER_ENTRY = fileURLToPath(
  new URL('../../.next/standalone/apps/web/server.js', import.meta.url),
);

/** A migrated, empty Postgres 18 in a throwaway container. */
export async function startDatabase(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  await runMigrations(container.getConnectionUri(), MIGRATIONS_FOLDER);
  return container;
}

export interface RunningServer {
  readonly url: string;
  stop(): Promise<void>;
}

export interface ExitedServer {
  readonly code: number | null;
  readonly output: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address !== null && typeof address === 'object')
          resolve(address.port);
        else reject(new Error('could not find a free port'));
      });
    });
  });
}

// Only what the server needs: nothing from the developer's shell leaks in.
//
// Return type is `NodeJS.ProcessEnv`, not `Record<string, string>`: Next augments
// the global `ProcessEnv` to require `NODE_ENV` as a literal union, and
// `child_process.spawn`'s `env` option is typed against `ProcessEnv`.
function serverEnv(
  port: number,
  extra: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    ...extra,
  };
}

function launch(port: number, extraEnv: Readonly<Record<string, string>>) {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(
      `No production build at ${SERVER_ENTRY}; run "pnpm build" first.`,
    );
  }
  const child: ChildProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: serverEnv(port, extraEnv),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = { output: '' };
  child.stdout
    ?.setEncoding('utf8')
    .on('data', (chunk: string) => (log.output += chunk));
  child.stderr
    ?.setEncoding('utf8')
    .on('data', (chunk: string) => (log.output += chunk));
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  );
  return { child, log, exited };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the production server and resolves once it answers HTTP. */
export async function startServer(
  extraEnv: Readonly<Record<string, string>>,
): Promise<RunningServer> {
  const port = await freePort();
  const url = `http://127.0.0.1:${String(port)}`;
  const { child, log, exited } = launch(port, extraEnv);
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(
        `server exited with ${String(child.exitCode)}:\n${log.output}`,
      );
    }
    try {
      await fetch(`${url}/api/health`);
      break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`server did not answer within 30 s:\n${log.output}`);
    }
    await sleep(200);
  }
  return {
    url,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await exited;
      }
    },
  };
}

/** Starts the server and waits for it to exit on its own (it is expected to). */
export async function runServerUntilExit(
  extraEnv: Readonly<Record<string, string>>,
): Promise<ExitedServer> {
  const { child, log, exited } = launch(await freePort(), extraEnv);
  const timeout = sleep(30_000).then(() => 'timeout' as const);
  const result = await Promise.race([exited, timeout]);
  if (result === 'timeout') {
    child.kill();
    throw new Error(`server was still running after 30 s:\n${log.output}`);
  }
  return { code: result, output: log.output };
}
