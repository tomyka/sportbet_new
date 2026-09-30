import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
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

/** Every container the reader starts carries this label, and only those. */
export const LABEL = 'sportbet-migrate';

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
export async function startMySql(): Promise<StartedMySqlContainer> {
  return new LoopbackMySqlContainer(MYSQL_IMAGE)
    .withDatabase(MYSQL_DATABASE)
    .withRootPassword(password())
    .withUserPassword(password())
    .withTmpFs({ '/var/lib/mysql': 'rw' })
    .withLabels({ [LABEL]: 'mysql' })
    .start();
}

/** The throwaway Postgres the reader loads: tmpfs data, loopback, random password, labelled. */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new LoopbackPostgreSqlContainer(POSTGRES_IMAGE)
    .withPassword(password())
    .withTmpFs({ '/var/lib/postgresql': 'rw' })
    .withLabels({ [LABEL]: 'postgres' })
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

/**
 * Restores the gzipped dump into the container's database: the file is
 * decompressed as it is streamed into the `mysql` client inside the
 * container (`docker exec -i`), so the dump is never written inside it.
 * The root password goes by environment, never on a command line.
 */
export async function restoreDump(
  container: StartedMySqlContainer,
  gzipped: string,
): Promise<Result<null, string>> {
  const client = spawn(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'MYSQL_PWD',
      container.getId(),
      'mysql',
      '--user=root',
      '--default-character-set=utf8mb4',
      MYSQL_DATABASE,
    ],
    {
      env: { ...process.env, MYSQL_PWD: container.getRootPassword() },
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    },
  );
  let stderr = '';
  client.stderr.setEncoding('utf8');
  client.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<number>((resolve, reject) => {
    client.on('error', reject);
    client.on('close', (code) => {
      resolve(code ?? -1);
    });
  });
  try {
    await pipeline(createReadStream(gzipped), createGunzip(), client.stdin);
  } catch {
    // The client stopped reading; its exit code says why.
  }
  const code = await exited;
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

/** The ids of every container, running or not, that carries the reader's label. */
export async function labelledContainers(): Promise<string[]> {
  const client = await getContainerRuntimeClient();
  const containers = await client.container.dockerode.listContainers({
    all: true,
    filters: { label: [LABEL] },
  });
  return containers.map(({ Id }) => Id);
}

/** Removes every container that carries the reader's label; returns how many. */
export async function removeLabelledContainers(): Promise<number> {
  const client = await getContainerRuntimeClient();
  const ids = await labelledContainers();
  for (const id of ids) {
    await client.container.dockerode
      .getContainer(id)
      .remove({ force: true, v: true });
  }
  return ids.length;
}
