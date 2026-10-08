import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duplex, type Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import type * as Testcontainers from 'testcontainers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  imageExists,
  joinNetwork,
  LABEL,
  labelledContainers,
  labelledNetworks,
  mysqlConnection,
  PID_LABEL,
  removeAbandonedContainers,
  removeAbandonedNetworks,
  removeRunContainers,
  removeRunNetworks,
  restoreDump,
  runInSportbetApp,
  startNetwork,
  startSportbetApp,
} from './containers';
import { ReaderProblem } from './problem';

// containers.ts's Docker calls, on a fake of the one client they all go
// through (Testcontainers' runtime client): no daemon is reached.

const runtime = vi.hoisted(() => ({
  client: vi.fn<() => Promise<FakeClient>>(),
}));

vi.mock('testcontainers', async (importOriginal) => ({
  ...(await importOriginal<typeof Testcontainers>()),
  getContainerRuntimeClient: runtime.client,
}));

interface Listed {
  readonly Id: string;
  readonly Labels?: Readonly<Record<string, string>>;
}

/** A Docker error as dockerode raises it: its HTTP status. */
const status = (statusCode: number) =>
  Object.assign(new Error(`docker said ${String(statusCode)}`), {
    statusCode,
  });

/** An exec: its output written by `answer` once its input is in, then its exit code. */
function fakeExec(
  answer: (input: Buffer, out: Writable, err: Writable) => void,
  exits: readonly { Running: boolean; ExitCode: number | null }[],
) {
  const options: { Env?: readonly string[]; Cmd?: readonly string[] }[] = [];
  let demuxed: { out: Writable; err: Writable } | null = null;
  const exec = {
    options,
    inspect: vi.fn(() =>
      Promise.resolve(exits[Math.min(inspected++, exits.length - 1)]),
    ),
    start: () => {
      const expected = Number(
        /^DUMP_BYTES=(\d+)$/
          .exec(options[0]?.Env?.find((each) => each.startsWith('DUMP_')) ?? '')
          ?.at(1) ?? 0,
      );
      const input: Buffer[] = [];
      const finish = () => {
        if (demuxed !== null) {
          answer(Buffer.concat(input), demuxed.out, demuxed.err);
        }
        stream.push(null);
      };
      // Like `head -c`: the exec ends once the dump's own length is in.
      const stream = new Duplex({
        read: () => undefined,
        write: (chunk: Buffer, _encoding, done) => {
          input.push(chunk);
          done();
          if (Buffer.concat(input).length >= expected) finish();
        },
      });
      if (expected === 0) setImmediate(finish);
      return Promise.resolve(stream);
    },
  };
  let inspected = 0;
  return {
    exec,
    demuxStream: (stream: Duplex, out: Writable, err: Writable) => {
      demuxed = { out, err };
      stream.resume();
    },
    getById: () => ({
      exec: (given: { Env?: readonly string[]; Cmd?: readonly string[] }) => {
        options.push(given);
        return Promise.resolve(exec);
      },
    }),
  };
}

/** The runtime client, as far as containers.ts reaches into it. */
function fakeClient({
  containers = [],
  networks = [],
  images = {},
  exec = fakeExec(() => undefined, [{ Running: false, ExitCode: 0 }]),
}: {
  containers?: Listed[];
  networks?: Listed[];
  images?: Readonly<Record<string, string | Error>>;
  exec?: ReturnType<typeof fakeExec>;
} = {}) {
  const removed: string[] = [];
  const refusals = new Map<string, Error>();
  const remove = (id: string) => {
    const refusal = refusals.get(id);
    if (refusal !== undefined) return Promise.reject(refusal);
    removed.push(id);
    return Promise.resolve();
  };
  const byLabel = (
    listed: Listed[],
    { filters }: { filters: { label: string[] } },
  ) =>
    Promise.resolve(
      listed.filter(({ Labels = {} }) =>
        filters.label.every((filter) => {
          const [key = '', value] = filter.split('=');
          return value === undefined ? key in Labels : Labels[key] === value;
        }),
      ),
    );
  const dockerode = {
    listContainers: vi.fn(
      (query: { all: boolean; filters: { label: string[] } }) =>
        byLabel(containers, query),
    ),
    listNetworks: vi.fn((query: { filters: { label: string[] } }) =>
      byLabel(networks, query),
    ),
    getContainer: (id: string) => ({ remove: () => remove(id) }),
    getNetwork: (id: string) => ({
      remove: () => remove(id),
      connect: vi.fn(() => Promise.resolve()),
    }),
    getImage: (image: string) => ({
      inspect: () => {
        const found = images[image];
        if (found === undefined) return Promise.reject(status(404));
        if (found instanceof Error) return Promise.reject(found);
        return Promise.resolve({ Id: found });
      },
    }),
    createNetwork: vi.fn(() => Promise.resolve()),
    modem: { demuxStream: exec.demuxStream },
  };
  return {
    removed,
    refusals,
    container: { dockerode, getById: exec.getById },
  };
}

type FakeClient = ReturnType<typeof fakeClient>;

const labelled = (id: string, run: string, pid?: string): Listed => ({
  Id: id,
  Labels: { [LABEL]: run, ...(pid === undefined ? {} : { [PID_LABEL]: pid }) },
});

/** A process id no process holds. */
const DEAD = '2147483646';
const ALIVE = String(process.pid);

describe('the labelled containers and networks', () => {
  it("lists a run's own, with the process that made each", async () => {
    runtime.client.mockResolvedValue(
      fakeClient({
        containers: [
          labelled('a', 'run-1', ALIVE),
          labelled('b', 'run-1', 'not a pid'),
          labelled('c', 'run-2', ALIVE),
          { Id: 'unlabelled' },
        ],
        networks: [labelled('n', 'run-1')],
      }),
    );
    expect(await labelledContainers('run-1')).toEqual([
      { id: 'a', run: 'run-1', pid: process.pid },
      { id: 'b', run: 'run-1', pid: null },
    ]);
    expect((await labelledContainers()).map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(await labelledNetworks('run-1')).toEqual([
      { id: 'n', run: 'run-1', pid: null },
    ]);
  });

  it("removes a run's containers but those kept, one already gone counted as not removed", async () => {
    const client = fakeClient({
      containers: [
        labelled('a', 'run-1'),
        labelled('kept', 'run-1'),
        labelled('gone', 'run-1'),
        labelled('other', 'run-2'),
      ],
    });
    client.refusals.set('gone', status(404));
    runtime.client.mockResolvedValue(client);
    expect(await removeRunContainers('run-1', ['kept'])).toBe(1);
    expect(client.removed).toEqual(['a']);
  });

  it('fails loudly on a network still in use', async () => {
    const client = fakeClient({ networks: [labelled('n', 'run-1')] });
    client.refusals.set('n', status(403));
    runtime.client.mockResolvedValue(client);
    await expect(removeRunNetworks('run-1')).rejects.toThrow('docker said 403');
  });

  it("removes only what a crashed run left: never a living process's", async () => {
    const client = fakeClient({
      containers: [
        labelled('crashed', 'run-1', DEAD),
        labelled('unknown', 'run-2'),
        labelled('running', 'run-3', ALIVE),
      ],
      networks: [
        labelled('crashed-net', 'run-1', DEAD),
        labelled('running-net', 'run-3', ALIVE),
      ],
    });
    runtime.client.mockResolvedValue(client);
    expect(await removeAbandonedContainers()).toBe(2);
    expect(await removeAbandonedNetworks()).toBe(1);
    expect(client.removed).toEqual(['crashed', 'unknown', 'crashed-net']);
  });
});

describe("the old app's image and network", () => {
  const DIGEST = 'a'.repeat(64);

  it('finds an image on this PC by its digest, and a missing one not at all', async () => {
    runtime.client.mockResolvedValue(
      fakeClient({ images: { 'sportbet-app:here': `sha256:${DIGEST}` } }),
    );
    expect(await imageExists('sportbet-app:here')).toBe(true);
    expect(await imageExists('sportbet-app:absent')).toBe(false);
  });

  it('refuses an image whose id is not a digest, and passes on any other Docker error', async () => {
    runtime.client.mockResolvedValue(
      fakeClient({
        images: {
          'sportbet-app:odd': 'not-a-digest',
          'sportbet-app:broken': status(500),
        },
      }),
    );
    await expect(imageExists('sportbet-app:odd')).rejects.toThrow(
      new ReaderProblem(
        'the image sportbet-app:odd has an id that is not a digest',
      ),
    );
    await expect(imageExists('sportbet-app:broken')).rejects.toThrow(
      'docker said 500',
    );
  });

  it('refuses to start an old app whose image is not on this PC', async () => {
    runtime.client.mockResolvedValue(fakeClient());
    await expect(
      startSportbetApp('run-1', 'abc1234', 'network', 'secret'),
    ).rejects.toThrow(
      "the image sportbet-app:abc1234 is not on this PC: build it from sportbet's commit (README)",
    );
  });

  it("makes the run's private network internal and labelled, and joins the MySQL to it", async () => {
    const client = fakeClient();
    const connect = vi.fn(() => Promise.resolve());
    client.container.dockerode.getNetwork = () => ({
      remove: () => Promise.resolve(),
      connect,
    });
    runtime.client.mockResolvedValue(client);
    const name = await startNetwork('run-1');
    expect(name).toBe('sportbet-migrate-run-1');
    expect(client.container.dockerode.createNetwork).toHaveBeenCalledWith({
      Name: name,
      Internal: true,
      Labels: {
        [LABEL]: 'run-1',
        [PID_LABEL]: ALIVE,
        'sportbet-migrate.role': 'network',
      },
    });
    await joinNetwork(name, { getId: () => 'mysql-id' });
    expect(connect).toHaveBeenCalledWith({
      Container: 'mysql-id',
      EndpointConfig: { Aliases: ['sportbet-mysql'] },
    });
  });
});

describe('restoring the dump', () => {
  let directory: string;
  let dump: string;
  const text = 'CREATE TABLE `users` (`id` int);\n';
  const mysql = {
    getId: () => 'mysql-id',
    getRootPassword: () => 'root-secret',
    getPort: () => 33_060,
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'containers-client-'));
    dump = join(directory, 'backup.sql.gz');
    writeFileSync(dump, gzipSync(text));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('streams the decompressed dump into the mysql client, its password in the environment only', async () => {
    let received = '';
    const exec = fakeExec(
      (input) => {
        received = input.toString('utf8');
      },
      [
        { Running: true, ExitCode: null },
        { Running: false, ExitCode: 0 },
      ],
    );
    runtime.client.mockResolvedValue(fakeClient({ exec }));
    expect(await restoreDump(mysql, dump)).toEqual({
      ok: true,
      value: null,
    });
    expect(received).toBe(text);
    const [options] = exec.exec.options;
    expect(options?.Env).toEqual([
      'MYSQL_PWD=root-secret',
      `DUMP_BYTES=${String(Buffer.byteLength(text))}`,
    ]);
    expect(options?.Cmd?.join(' ')).not.toContain('root-secret');
  });

  it("reports a failed load by the client's exit code and dump line, never its message", async () => {
    const exec = fakeExec(
      (_input, _out, err) => {
        err.write(
          "ERROR 1064 (42000) at line 57: near 'sentinel.ada@example.invalid'",
        );
      },
      [{ Running: false, ExitCode: 1 }],
    );
    runtime.client.mockResolvedValue(fakeClient({ exec }));
    expect(await restoreDump(mysql, dump)).toEqual({
      ok: false,
      refusal: 'the mysql client exited with 1 at dump line 57',
    });
  });

  it('reports a client that never says its exit code as -1', async () => {
    const exec = fakeExec(
      () => undefined,
      [{ Running: false, ExitCode: null }],
    );
    runtime.client.mockResolvedValue(fakeClient({ exec }));
    expect(await restoreDump(mysql, dump)).toEqual({
      ok: false,
      refusal: 'the mysql client exited with -1',
    });
  });

  it('connects to the restored database on loopback, as root', () => {
    expect(mysqlConnection(mysql)).toEqual({
      host: '127.0.0.1',
      port: 33_060,
      user: 'root',
      password: 'root-secret',
      database: 'sportbet',
    });
  });
});

describe("the old app's commands", () => {
  it('returns standard output and the exit code, standard error dropped', async () => {
    const exec = fakeExec(
      (_input, out, err) => {
        out.write('{"ranks":');
        out.write('[]}');
        err.write('a warning that quotes a row');
      },
      [{ Running: false, ExitCode: 0 }],
    );
    runtime.client.mockResolvedValue(fakeClient({ exec }));
    const app = { getId: () => 'app-id' };
    expect(await runInSportbetApp(app, 'echo 1;')).toEqual({
      exitCode: 0,
      stdout: '{"ranks":[]}',
    });
    expect(exec.exec.options[0]?.Cmd).toEqual([
      'php',
      'artisan',
      'tinker',
      '--execute=echo 1;',
    ]);
  });
});
