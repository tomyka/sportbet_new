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
import {
  GenericContainer,
  getContainerRuntimeClient,
  type StartedTestContainer,
} from 'testcontainers';
import { ReaderProblem } from './problem';

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

/** The labels of a container or network made by run `run` of this process. */
const labels = (
  run: string,
  role: 'mysql' | 'postgres' | 'sportbet-app' | 'network',
) => ({
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

/**
 * A labelled container or network: its id, its run, and the process that
 * made it.
 */
export interface LabelledResource {
  readonly id: string;
  readonly run: string;
  readonly pid: number | null;
}

/** What the reader labels: its containers, and the old app's private network. */
type Kind = 'container' | 'network';

/**
 * Every container (running or not) or every network that carries the
 * reader's label - of run `run` only, when given.
 */
async function labelled(kind: Kind, run?: string): Promise<LabelledResource[]> {
  const { dockerode } = (await getContainerRuntimeClient()).container;
  const filters = { label: [run === undefined ? LABEL : `${LABEL}=${run}`] };
  const found: readonly {
    readonly Id: string;
    readonly Labels?: Readonly<Record<string, string>> | undefined;
  }[] =
    kind === 'container'
      ? await dockerode.listContainers({ all: true, filters })
      : await dockerode.listNetworks({ filters });
  return found.map(({ Id, Labels }) => {
    const pid = Number(Labels?.[PID_LABEL]);
    return {
      id: Id,
      run: Labels?.[LABEL] ?? '',
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    };
  });
}

/**
 * Removes the containers (forced, with their volumes) or the networks
 * `ids`; returns how many it removed. One already gone or being removed
 * (isGone) is not a failure. A network still in use refuses removal, so a
 * run's containers go before its network.
 */
async function removeLabelled(
  kind: Kind,
  ids: readonly string[],
): Promise<number> {
  const { dockerode } = (await getContainerRuntimeClient()).container;
  let removed = 0;
  for (const id of ids) {
    try {
      await (kind === 'container'
        ? dockerode.getContainer(id).remove({ force: true, v: true })
        : dockerode.getNetwork(id).remove());
      removed += 1;
    } catch (error) {
      // A network still in use answers 403, which is not isGone and so
      // throws on purpose: a run's containers are removed before its
      // network, so a 403 here is a real leftover and fails loudly.
      if (!isGone(error)) throw error;
    }
  }
  return removed;
}

/**
 * Every container, running or not, that carries the reader's label - of
 * run `run` only, when given.
 */
export const labelledContainers = (run?: string) => labelled('container', run);

/** Every network carrying the reader's label - of run `run` only, when given. */
export const labelledNetworks = (run?: string) => labelled('network', run);

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
  resources: readonly LabelledResource[],
  alive: (pid: number) => boolean = isAlive,
): LabelledResource[] =>
  resources.filter(({ pid }) => pid === null || !alive(pid));

/**
 * Whether a Docker error says the container or network is already gone
 * (404) or already being removed (409): what a second cleanup of the same
 * object meets, and not a failure.
 */
export function isGone(error: unknown): boolean {
  const status: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'statusCode')
      : undefined;
  return status === 404 || status === 409;
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
  return removeLabelled('container', ids);
}

/**
 * Removes the labelled containers a crashed run left (abandoned); returns
 * how many it removed. Another run's, still going, are left alone.
 */
export async function removeAbandonedContainers(): Promise<number> {
  return removeLabelled(
    'container',
    abandoned(await labelledContainers()).map(({ id }) => id),
  );
}

/** Removes run `run`'s networks; returns how many it removed. */
export async function removeRunNetworks(run: string): Promise<number> {
  return removeLabelled(
    'network',
    (await labelledNetworks(run)).map(({ id }) => id),
  );
}

/** Removes the labelled networks a crashed run left (abandoned). */
export async function removeAbandonedNetworks(): Promise<number> {
  return removeLabelled(
    'network',
    abandoned(await labelledNetworks()).map(({ id }) => id),
  );
}

/**
 * sportbet's own application image, as production runs it: the parity
 * checker's oracle (b). The reader never pulls it: it must already be on
 * this PC (README: building it from sportbet's commit).
 */
export const SPORTBET_APP_IMAGE = 'sportbet-app';

/** The MySQL container's name on the run's private network. */
const MYSQL_ALIAS = 'sportbet-mysql';

/** Whether a Docker error says the object does not exist (404). */
const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  Reflect.get(error, 'statusCode') === 404;

/** An image's id as Docker names it locally: 64 hex digits. */
const IMAGE_ID = /^(?:sha256:)?([0-9a-f]{64})$/;

/**
 * The id of `image` on this PC's Docker, as 64 bare hex digits - which
 * Testcontainers passes on as they are, and which Docker never resolves
 * against a registry - or null when the image is not here.
 */
async function localImageId(image: string): Promise<string | null> {
  const client = await getContainerRuntimeClient();
  let id: string;
  try {
    ({ Id: id } = await client.container.dockerode.getImage(image).inspect());
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const hex = IMAGE_ID.exec(id)?.[1];
  if (hex === undefined) {
    throw new ReaderProblem(
      `the image ${image} has an id that is not a digest`,
    );
  }
  return hex;
}

/** Whether `image` is on this PC's Docker. */
export async function imageExists(image: string): Promise<boolean> {
  return (await localImageId(image)) !== null;
}

/**
 * The run's private network: internal, so nothing on it has a route out
 * of this PC, and labelled like the run's containers. Its name.
 */
export async function startNetwork(run: string): Promise<string> {
  const client = await getContainerRuntimeClient();
  const name = `${LABEL}-${run}`;
  await client.container.dockerode.createNetwork({
    Name: name,
    Internal: true,
    Labels: labels(run, 'network'),
  });
  return name;
}

/** Joins the MySQL to the network, where the old app finds it as MYSQL_ALIAS. */
export async function joinNetwork(
  network: string,
  mysql: StartedMySqlContainer,
): Promise<void> {
  const client = await getContainerRuntimeClient();
  await client.container.dockerode.getNetwork(network).connect({
    Container: mysql.getId(),
    EndpointConfig: { Aliases: [MYSQL_ALIAS] },
  });
}

/**
 * sportbet's own app at `tag`, idle, on the run's private network only: no
 * port published and no route out, a throwaway APP_KEY, mail kept in
 * memory, jobs run at once, logs dropped (spec 2). It reads and rewrites
 * the restored copy as MySQL's root (`mysqlRootPassword`), as the copy is
 * thrown away with it. The image is looked up on this PC and started by
 * its id, so no registry is ever asked for it: one that is not here is a
 * ReaderProblem, and nothing is started.
 */
export async function startSportbetApp(
  run: string,
  tag: string,
  network: string,
  mysqlRootPassword: string,
): Promise<StartedTestContainer> {
  const image = `${SPORTBET_APP_IMAGE}:${tag}`;
  const id = await localImageId(image);
  if (id === null) {
    throw new ReaderProblem(
      `the image ${image} is not on this PC: build it from sportbet's commit (README)`,
    );
  }
  return new GenericContainer(id)
    .withNetworkMode(network)
    .withEntrypoint(['tail'])
    .withCommand(['-f', '/dev/null'])
    .withEnvironment({
      APP_ENV: 'parity',
      APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
      APP_DEBUG: 'false',
      DB_CONNECTION: 'mysql',
      DB_HOST: MYSQL_ALIAS,
      DB_PORT: '3306',
      DB_DATABASE: MYSQL_DATABASE,
      DB_USERNAME: 'root',
      DB_PASSWORD: mysqlRootPassword,
      CACHE_STORE: 'array',
      SESSION_DRIVER: 'array',
      MAIL_MAILER: 'array',
      QUEUE_CONNECTION: 'sync',
      LOG_CHANNEL: 'null',
    })
    .withLabels(labels(run, 'sportbet-app'))
    .start();
}

/** A command's exit code and standard output; its standard error is dropped. */
export interface ExecOutput {
  readonly exitCode: number;
  readonly stdout: string;
}

/**
 * Runs `script` in the old app with `php artisan tinker --execute`, over an
 * exec on the client that started it, as restoreDump does - not through
 * Testcontainers' exec, which logs a command's whole output when its
 * stream fails, and tinker's output can quote a row's values. Its standard
 * error is dropped unread; its standard output is returned to be parsed,
 * never printed.
 */
export async function runInSportbetApp(
  app: StartedTestContainer,
  script: string,
): Promise<ExecOutput> {
  const client = await getContainerRuntimeClient();
  const exec = await client.container.getById(app.getId()).exec({
    Cmd: ['php', 'artisan', 'tinker', `--execute=${script}`],
    WorkingDir: '/var/www/html',
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const chunks: Buffer[] = [];
  client.container.dockerode.modem.demuxStream(
    stream,
    new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        chunks.push(chunk);
        done();
      },
    }),
    new Writable({
      write: (_chunk, _encoding, done) => {
        done();
      },
    }),
  );
  await new Promise<void>((resolve) => {
    stream.once('end', resolve);
    stream.once('close', resolve);
    stream.once('error', () => {
      resolve();
    });
  });
  return {
    exitCode: await exitCodeOf(exec),
    stdout: Buffer.concat(chunks).toString('utf8'),
  };
}

/** Stops and removes the old app's container, with its volumes. */
export async function stopSportbetApp(
  app: StartedTestContainer,
): Promise<void> {
  await app.stop({ remove: true, removeVolumes: true });
}
