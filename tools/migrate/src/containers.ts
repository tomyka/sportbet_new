import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Writable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { POSTGRES_IMAGE } from '@sportbet/db/migrations';
import { ok, refuse, type Result } from '@sportbet/domain';
import {
  MySqlContainer,
  type StartedMySqlContainer,
} from '@testcontainers/mysql';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';

/**
 * Production's MySQL: HeatWave `sportbet-db` reports 26.7.0. Bumped
 * deliberately when HeatWave's is; a dump from another major.minor is
 * refused (checkDump).
 */
export const MYSQL_IMAGE = 'mysql:26.7.0';
export const MYSQL_VERSION = '26.7.0';

/**
 * Every container the reader starts carries this label, and only those;
 * its value is the run's id, so a run removes its own containers only.
 */
export const LABEL = 'sportbet-migrate';
/** The process that started the container: while it lives, no other run removes it. */
export const PID_LABEL = 'sportbet-migrate.pid';

/** The labels of a container started by run `run` of this process. */
const labels = (run: string, role: 'mysql' | 'postgres') => ({
  [LABEL]: run,
  [PID_LABEL]: String(process.pid),
  'sportbet-migrate.role': role,
});

const MYSQL_DATABASE = 'sportbet';

/** A random per-run password, held only in memory. */
const password = () => randomBytes(24).toString('hex');

/** Publishes the container's ports on the loopback interface only. */
function loopbackOnly(hostConfig: {
  PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[]>;
}): void {
  for (const bindings of Object.values(hostConfig.PortBindings ?? {})) {
    for (const binding of bindings) binding.HostIp = '127.0.0.1';
  }
}

class LoopbackMySqlContainer extends MySqlContainer {
  protected override beforeContainerCreated(): Promise<void> {
    loopbackOnly(this.hostConfig);
    return Promise.resolve();
  }
}

class LoopbackPostgreSqlContainer extends PostgreSqlContainer {
  protected override beforeContainerCreated(): Promise<void> {
    loopbackOnly(this.hostConfig);
    return Promise.resolve();
  }
}

/**
 * A throwaway MySQL to restore the dump into: its data directory on tmpfs
 * (the image's volume path, so no Docker volume is made), a random root
 * password, loopback only, labelled.
 */
export async function startMySql(run: string): Promise<StartedMySqlContainer> {
  return new LoopbackMySqlContainer(MYSQL_IMAGE)
    .withDatabase(MYSQL_DATABASE)
    .withRootPassword(password())
    .withUserPassword(password())
    .withTmpFs({ '/var/lib/mysql': 'rw' })
    .withLabels(labels(run, 'mysql'))
    .start();
}

/** The throwaway Postgres the reader loads: tmpfs data, loopback, random password, labelled. */
export async function startPostgres(
  run: string,
): Promise<StartedPostgreSqlContainer> {
  return new LoopbackPostgreSqlContainer(POSTGRES_IMAGE)
    .withPassword(password())
    .withTmpFs({ '/var/lib/postgresql': 'rw' })
    .withLabels(labels(run, 'postgres'))
    .start();
}

/** A connection URL on the loopback address the ports are published on. */
export const postgresUrl = (container: StartedPostgreSqlContainer) =>
  `postgres://${encodeURIComponent(container.getUsername())}:${encodeURIComponent(container.getPassword())}@127.0.0.1:${String(container.getPort())}/${container.getDatabase()}`;

/**
 * What a failed load may say: the mysql client's exit code and the dump's
 * line number, never its message, which quotes the statement near the
 * error and so could quote a row of `users`.
 */
export function scrubbedLoadError(exitCode: number, stderr: string): string {
  const line = /\bat line (\d+)/.exec(stderr)?.[1];
  return `the mysql client exited with ${String(exitCode)}${line === undefined ? '' : ` at dump line ${line}`}`;
}

/** Waits for an exec's process to finish; its exit code, or -1 if it never reports one. */
async function exitCodeOf(exec: {
  inspect: () => Promise<{ Running: boolean; ExitCode: number | null }>;
}): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { Running, ExitCode } = await exec.inspect();
    if (!Running) return ExitCode ?? -1;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return -1;
}

/** How many bytes the gzipped file decompresses to. */
async function decompressedBytes(gzipped: string): Promise<number> {
  let bytes = 0;
  const chunks: AsyncIterable<unknown> =
    createReadStream(gzipped).pipe(createGunzip());
  for await (const chunk of chunks) {
    if (Buffer.isBuffer(chunk)) bytes += chunk.length;
  }
  return bytes;
}

/**
 * Restores the gzipped dump into the container's database: the file is
 * decompressed as it is streamed into the `mysql` client inside the
 * container, over an exec with stdin attached on the same Testcontainers
 * client that started the container - so the stream can only reach the
 * daemon the preflight checked is on this PC, and the dump is never
 * written inside the container. The root password goes by the exec's
 * environment, never on a command line.
 *
 * `head -c` ends the client's input after the dump's own length, so the
 * reader never has to half-close the connection (which a Windows named
 * pipe cannot do without closing it, losing the client's error line); the
 * daemon ends the connection once the client has exited.
 */
export async function restoreDump(
  container: StartedMySqlContainer,
  gzipped: string,
): Promise<Result<null, string>> {
  const bytes = await decompressedBytes(gzipped);
  const client = await getContainerRuntimeClient();
  const exec = await client.container.getById(container.getId()).exec({
    Cmd: [
      'sh',
      '-c',
      `head -c "$DUMP_BYTES" | mysql --user=root --default-character-set=utf8mb4 ${MYSQL_DATABASE}`,
    ],
    Env: [
      `MYSQL_PWD=${container.getRootPassword()}`,
      `DUMP_BYTES=${String(bytes)}`,
    ],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await exec.start({ hijack: true, stdin: true });
  let stderr = '';
  client.container.dockerode.modem.demuxStream(
    stream,
    new Writable({
      write: (_chunk, _encoding, done) => {
        done();
      },
    }),
    new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        stderr += chunk.toString('utf8');
        done();
      },
    }),
  );
  const closed = new Promise<void>((resolve) => {
    stream.once('end', resolve);
    stream.once('close', resolve);
    stream.once('error', () => {
      resolve();
    });
  });
  const input = createReadStream(gzipped).pipe(createGunzip());
  const read = { failed: false };
  input.once('error', () => {
    read.failed = true;
    stream.destroy();
  });
  input.pipe(stream, { end: false });
  await closed;
  input.unpipe(stream);
  input.destroy();
  if (read.failed) return refuse('the dump could not be read while it loaded');
  const code = await exitCodeOf(exec);
  return code === 0 ? ok(null) : refuse(scrubbedLoadError(code, stderr));
}

/** The MySQL connection the reader reads through: loopback, root, the restored database. */
export const mysqlConnection = (container: StartedMySqlContainer) => ({
  host: '127.0.0.1',
  port: container.getPort(),
  user: 'root',
  password: container.getRootPassword(),
  database: MYSQL_DATABASE,
});

/** A labelled container: its id, its run, and the process that started it. */
export interface LabelledContainer {
  readonly id: string;
  readonly run: string;
  readonly pid: number | null;
}

/**
 * Every container, running or not, that carries the reader's label - of
 * run `run` only, when given.
 */
export async function labelledContainers(
  run?: string,
): Promise<LabelledContainer[]> {
  const client = await getContainerRuntimeClient();
  const containers = await client.container.dockerode.listContainers({
    all: true,
    filters: { label: [run === undefined ? LABEL : `${LABEL}=${run}`] },
  });
  return containers.map(({ Id, Labels }) => {
    const pid = Number(Labels[PID_LABEL]);
    return {
      id: Id,
      run: Labels[LABEL] ?? '',
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    };
  });
}

/** Whether process `pid` is still running (EPERM: it is, as another user). */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Reflect.get(Object(error), 'code') === 'EPERM';
  }
}

/**
 * The containers a crashed run left: those whose starting process is no
 * longer running (or that do not say which it was). A container of a run
 * still going - in another terminal, or a `--keep` Postgres waiting for
 * its Ctrl-C - is not abandoned.
 */
export const abandoned = (
  containers: readonly LabelledContainer[],
  alive: (pid: number) => boolean = isAlive,
): LabelledContainer[] =>
  containers.filter(({ pid }) => pid === null || !alive(pid));

/**
 * Whether a Docker error says the container is already gone (404) or
 * already being removed (409): what a second cleanup of the same
 * container meets, and not a failure.
 */
export function isGone(error: unknown): boolean {
  const status: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'statusCode')
      : undefined;
  return status === 404 || status === 409;
}

/** Force-removes the containers `ids`; returns how many it removed. */
async function removeContainers(ids: readonly string[]): Promise<number> {
  const client = await getContainerRuntimeClient();
  let removed = 0;
  for (const id of ids) {
    try {
      await client.container.dockerode
        .getContainer(id)
        .remove({ force: true, v: true });
      removed += 1;
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  }
  return removed;
}

/**
 * Removes run `run`'s containers, but those in `except` (a kept
 * Postgres); returns how many it removed.
 */
export async function removeRunContainers(
  run: string,
  except: readonly string[] = [],
): Promise<number> {
  const ids = (await labelledContainers(run))
    .map(({ id }) => id)
    .filter((id) => !except.includes(id));
  return removeContainers(ids);
}

/**
 * Removes the labelled containers a crashed run left (abandoned); returns
 * how many it removed. Another run's, still going, are left alone.
 */
export async function removeAbandonedContainers(): Promise<number> {
  return removeContainers(
    abandoned(await labelledContainers()).map(({ id }) => id),
  );
}
