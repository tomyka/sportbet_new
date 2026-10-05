import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ENTRY = fileURLToPath(
  new URL('../../.next/standalone/apps/web/server.js', import.meta.url),
);
const SERVER_DIR = dirname(SERVER_ENTRY);

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

// `next build` copies apps/web/.env* into the standalone output, and the
// server loads them - so a developer's local .env would silently override
// the DATABASE_URL (and everything else) this harness sets, defeating the
// isolation `serverEnv` exists for. Local settings belong in .env.local,
// which Next does not copy into the standalone build.
function assertNoLeakedEnvFiles(): void {
  for (const name of ['.env', '.env.production']) {
    const candidate = join(SERVER_DIR, name);
    if (existsSync(candidate)) {
      throw new Error(
        `${candidate} exists: apps/web/.env* is copied into the standalone server by next build; keep local settings in .env.local`,
      );
    }
  }
}

function launch(
  port: number,
  extraEnv: Readonly<Record<string, string>>,
  logFile?: string,
) {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(
      `No production build at ${SERVER_ENTRY}; run "pnpm build" first.`,
    );
  }
  assertNoLeakedEnvFiles();
  const child: ChildProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: serverEnv(port, extraEnv),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = { output: '' };
  const record = (chunk: string) => {
    log.output += chunk;
    if (logFile !== undefined) appendFileSync(logFile, chunk);
  };
  child.stdout?.setEncoding('utf8').on('data', record);
  child.stderr?.setEncoding('utf8').on('data', record);
  // If the test process itself is killed (Ctrl-C, a hard vitest teardown),
  // take the server child down too, rather than leaving it orphaned.
  const killChild = () => child.kill();
  process.once('exit', killChild);
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => {
      process.removeListener('exit', killChild);
      resolve(code);
    });
  });
  return { child, log, exited };
}

/** What every feature test's server runs with: its database, the Mailpit stand-in, and a key no environment uses. */
export function appEnv(
  databaseUrl: string,
  mailpitUrl: string,
): Record<string, string> {
  return {
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: 'feature-tests-only-not-a-secret-0123456789',
    MAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: mailpitUrl,
    MAIL_FROM_ADDRESS: 'noreply@sportbet.test',
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the production server and resolves once it answers HTTP; what it
 * prints is also appended to `logFile`, when given, for tests that check
 * what the server logs (serverLogSince).
 */
export async function startServer(
  extraEnv: Readonly<Record<string, string>>,
  logFile?: string,
): Promise<RunningServer> {
  const port = await freePort();
  const url = `http://127.0.0.1:${String(port)}`;
  const { child, log, exited } = launch(port, extraEnv, logFile);
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, 30_000);
  });
  const result = await Promise.race([exited, timeout]);
  clearTimeout(timer);
  if (result === 'timeout') {
    child.kill();
    throw new Error(`server was still running after 30 s:\n${log.output}`);
  }
  return { code: result, output: log.output };
}
