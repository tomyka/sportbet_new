import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { useTestDatabase } from '@sportbet/db/testing';
import { ok, refuse } from '@sportbet/domain';
import type * as Testcontainers from 'testcontainers';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';
import type * as Containers from '../src/containers';
import type { BackupFetcher } from '../src/fetch';
import { RunResources, runReader, type ReaderOptions } from '../src/run';
import type * as SportbetApp from '../src/sportbet-app';
import type * as SportbetRead from '../src/sportbet-read';
import { renderDump, syntheticDump } from './fixtures/sportbet-dump';
import { fakeSportbet, type FakeConnection } from './support/fake-sportbet';

// The whole reader in process: Docker, the restored MySQL and the old app
// faked at their modules, the dump a real file in a real workspace, and the
// load, reconciliation and recalculation run on the suite's test database.
// The end-to-end tests (reader*.test.ts) run the same path on real containers.

const docker = vi.hoisted(() => ({
  startMySql: vi.fn<(run: string) => Promise<FakeContainer>>(),
  restoreDump: vi.fn<typeof Containers.restoreDump>(),
  startPostgres: vi.fn<(run: string) => Promise<FakeContainer>>(),
  postgresUrl: vi.fn<typeof Containers.postgresUrl>(),
  labelledContainers: vi.fn<typeof Containers.labelledContainers>(),
  labelledNetworks: vi.fn<typeof Containers.labelledNetworks>(),
  removeRunContainers: vi.fn<typeof Containers.removeRunContainers>(),
  removeRunNetworks: vi.fn<typeof Containers.removeRunNetworks>(),
  imageExists: vi.fn<typeof Containers.imageExists>(),
  openSportbet: vi.fn<() => Promise<FakeConnection>>(),
  runSportbetApp: vi.fn<typeof SportbetApp.runSportbetApp>(),
  runtime: vi.fn<() => Promise<FakeRuntime>>(),
}));

vi.mock('../src/containers', async (importOriginal) => ({
  ...(await importOriginal<typeof Containers>()),
  startMySql: docker.startMySql,
  restoreDump: docker.restoreDump,
  mysqlConnection: () => ({}),
  startPostgres: docker.startPostgres,
  postgresUrl: docker.postgresUrl,
  labelledContainers: docker.labelledContainers,
  labelledNetworks: docker.labelledNetworks,
  removeRunContainers: docker.removeRunContainers,
  removeRunNetworks: docker.removeRunNetworks,
  removeAbandonedContainers: () => Promise.resolve(0),
  removeAbandonedNetworks: () => Promise.resolve(0),
  imageExists: docker.imageExists,
}));

vi.mock('../src/sportbet-read', async (importOriginal) => ({
  ...(await importOriginal<typeof SportbetRead>()),
  openSportbet: docker.openSportbet,
}));

vi.mock('../src/sportbet-app', async (importOriginal) => ({
  ...(await importOriginal<typeof SportbetApp>()),
  runSportbetApp: docker.runSportbetApp,
}));

vi.mock('testcontainers', async (importOriginal) => ({
  ...(await importOriginal<typeof Testcontainers>()),
  getContainerRuntimeClient: docker.runtime,
}));

useTestDatabase();

const OBJECT = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';

/** A container that only stops: what the run asks of it. */
function fakeContainer(id: string) {
  return {
    getId: () => id,
    stop: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
  };
}

type FakeContainer = ReturnType<typeof fakeContainer>;

let mysql: FakeContainer;
let postgres: FakeContainer;
let workspaces: string[];

/** Writes the synthetic dump, gzipped, into the run's workspace. */
const writeDump: BackupFetcher['fetch'] = (directory) => {
  if (!directory.startsWith(temporary)) {
    throw new Error('a workspace outside the private temporary directory');
  }
  workspaces.push(directory);
  const path = join(directory, 'backup.sql.gz');
  writeFileSync(path, gzipSync(renderDump(syntheticDump())));
  return Promise.resolve({ objectName: OBJECT, path });
};

const options = (more: Partial<ReaderOptions> = {}): ReaderOptions => ({
  fetcher: { fetch: writeDump },
  keep: false,
  now: () => new Date('2026-09-29T12:00:00Z'),
  ...more,
});

/** A runtime client as runtimeRefusal reads it, its daemon at `host`. */
const runtimeAt = (host: string) => ({
  info: { containerRuntime: { host } },
  container: { dockerode: { modem: { socketPath: '/var/run/docker.sock' } } },
});

type FakeRuntime = ReturnType<typeof runtimeAt>;

const coded = (code: string) =>
  Object.assign(new Error('the file system said no'), { code });

/** This file's own temporary directory, where its runs make their workspaces. */
let temporary: string;

beforeEach(() => {
  vi.clearAllMocks();
  // A run makes its workspace, and its preflight looks for leftovers, under
  // the OS temporary directory: here a private one, so a run of this file
  // is never seen by - or removes anything of - a real or end-to-end run
  // on this PC at the same time (reader*.test.ts check that none remains).
  temporary = mkdtempSync(join(tmpdir(), 'sportbet-run-test-'));
  for (const name of ['TMP', 'TEMP', 'TMPDIR']) vi.stubEnv(name, temporary);
  workspaces = [];
  mysql = fakeContainer('mysql-id');
  postgres = fakeContainer('postgres-id');
  docker.runtime.mockResolvedValue(runtimeAt('localhost'));
  docker.startMySql.mockResolvedValue(mysql);
  docker.restoreDump.mockResolvedValue(ok(null));
  docker.startPostgres.mockResolvedValue(postgres);
  docker.postgresUrl.mockReturnValue(inject('databaseUrl'));
  docker.labelledContainers.mockResolvedValue([]);
  docker.labelledNetworks.mockResolvedValue([]);
  docker.removeRunContainers.mockResolvedValue(0);
  docker.removeRunNetworks.mockResolvedValue(0);
  docker.imageExists.mockResolvedValue(true);
  docker.openSportbet.mockImplementation(() =>
    Promise.resolve(fakeSportbet(syntheticDump())),
  );
  docker.runSportbetApp.mockImplementation((resources) => {
    resources.network = 'parity-network';
    return Promise.resolve({ ranks: [], leaderboard: [] });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(temporary, { recursive: true, force: true });
});

describe('the reader in process', () => {
  it('reads, maps, loads, reconciles and recalculates the dump, then deletes all it made', async () => {
    const { report, kept } = await runReader(options());
    expect(report.problem).toBeNull();
    expect(report.dump).toMatchObject({
      object: OBJECT,
      ageHours: 9,
      stale: false,
      engine: 'mysql 26.7.0',
    });
    expect(report.tables.length).toBeGreaterThan(0);
    expect(report.tables.every(({ inDump, read }) => inDump === read)).toBe(
      true,
    );
    expect(report.recalculations.length).toBeGreaterThan(0);
    expect(report.parity).toBeNull();
    expect(report.cleanup).toContain(
      'the dump, its temporary directory and both containers are deleted',
    );
    // The fixture holds rows the map refuses.
    expect(report.exitStatus).toBe(1);
    expect(kept).toBeNull();
    expect(mysql.stop).toHaveBeenCalledWith({
      remove: true,
      removeVolumes: true,
    });
    expect(postgres.stop).toHaveBeenCalledWith({
      remove: true,
      removeVolumes: true,
    });
    expect(workspaces.map((workspace) => existsSync(workspace))).toEqual([
      false,
    ]);
  });

  it('keeps the Postgres on --keep, and stops it when asked', async () => {
    const resources = new RunResources();
    const { report, kept } = await runReader(
      options({ keep: true }),
      resources,
    );
    expect(report.problem).toBeNull();
    expect(report.cleanup).toContain(
      'the dump, its temporary directory and the MySQL container are deleted; the Postgres container is kept (--keep)',
    );
    expect(kept).toMatchObject({
      url: inject('databaseUrl'),
      containerId: 'postgres-id',
    });
    expect(postgres.stop).not.toHaveBeenCalled();
    expect(docker.labelledContainers).toHaveBeenCalledWith(resources.id);
    docker.labelledContainers.mockResolvedValue([
      { id: 'stray', run: resources.id, pid: null },
    ]);
    expect(await kept?.stop()).toEqual(['stray']);
    expect(postgres.stop).toHaveBeenCalledOnce();
  });

  it("with --parity, runs the old app's recalculation and compares, then removes its network", async () => {
    const resources = new RunResources();
    const { report } = await runReader(
      options({ parity: { tag: 'abc1234' } }),
      resources,
    );
    expect(report.problem).toBeNull();
    expect(docker.imageExists).toHaveBeenCalledWith('sportbet-app:abc1234');
    expect(docker.runSportbetApp).toHaveBeenCalledOnce();
    expect(report.parity).not.toBeNull();
    expect(docker.removeRunNetworks).toHaveBeenCalledWith(resources.id);
    expect(report.cleanup).toContain(
      "the old app's container and the private network are deleted",
    );
  });
});

describe('a run that fails stops at its stage, and still cleans up', () => {
  it.each([
    {
      what: "the old app's image is not on this PC",
      arrange: () => docker.imageExists.mockResolvedValue(false),
      parity: true,
      problem:
        "preflight: the old app's image sportbet-app:abc1234 is not on this PC; build it first (README, parity)",
    },
    {
      what: 'the container runtime is not on this PC',
      arrange: () => docker.runtime.mockResolvedValue(runtimeAt('10.0.0.9')),
      parity: false,
      problem:
        'preflight: the container runtime publishes ports on a host that is not this PC',
    },
    {
      what: 'the dump does not load',
      arrange: () =>
        docker.restoreDump.mockResolvedValue(
          refuse('the mysql client exited with 1'),
        ),
      parity: false,
      problem:
        'restoring the dump into MySQL: the dump did not load: the mysql client exited with 1',
    },
    {
      what: "sportbet's schema drifted",
      arrange: () =>
        docker.openSportbet.mockImplementation(() =>
          Promise.resolve(
            fakeSportbet(syntheticDump(), { missing: ['users.email'] }),
          ),
        ),
      parity: false,
      problem:
        "checking sportbet's schema: sportbet's schema drifted: users.email: missing",
    },
  ])('$what', async ({ arrange, parity, problem }) => {
    arrange();
    const { report } = await runReader(
      options(parity ? { parity: { tag: 'abc1234' } } : {}),
    );
    expect(report.problem).toBe(problem);
    expect(report.exitStatus).toBe(2);
    expect(report.cleanup.some((line) => line.startsWith('FAILED'))).toBe(
      false,
    );
    expect(workspaces.every((workspace) => !existsSync(workspace))).toBe(true);
  });

  it('refuses a fetcher that writes outside its directory', async () => {
    const { report } = await runReader(
      options({
        fetcher: {
          fetch: async (directory, signal) => {
            const fetched = await writeDump(directory, signal);
            return { ...fetched, path: join(directory, '..', 'backup.sql.gz') };
          },
        },
      }),
    );
    expect(report.problem).toBe(
      'fetching the backup: the fetcher wrote outside its directory',
    );
    expect(docker.startMySql).not.toHaveBeenCalled();
  });

  it('refuses an incomplete dump before any container starts', async () => {
    const { report } = await runReader(
      options({
        fetcher: {
          fetch: (directory) => {
            const path = join(directory, 'backup.sql.gz');
            writeFileSync(
              path,
              gzipSync(renderDump(syntheticDump(), { complete: false })),
            );
            return Promise.resolve({ objectName: OBJECT, path });
          },
        },
      }),
    );
    expect(report.problem).toMatch(
      /^checking the dump: the dump was refused: /,
    );
    expect(docker.startMySql).not.toHaveBeenCalled();
  });

  it('stops on an interrupt, removing every container and network of the run', async () => {
    const resources = new RunResources();
    const { report } = await runReader(
      options({
        fetcher: {
          fetch: async (directory, signal) => {
            const fetched = await writeDump(directory, signal);
            await resources.cancel();
            return fetched;
          },
        },
      }),
      resources,
    );
    expect(report.problem).toBe('fetching the backup: the run was interrupted');
    expect(docker.removeRunContainers).toHaveBeenCalledWith(resources.id);
    expect(docker.removeRunNetworks).toHaveBeenCalledWith(resources.id);
    expect(workspaces.every((workspace) => !existsSync(workspace))).toBe(true);
  });

  it("reports an interrupt's failed removals with the run's other cleanup", async () => {
    const resources = new RunResources();
    docker.removeRunContainers.mockRejectedValueOnce(coded('EACCES'));
    docker.removeRunNetworks.mockRejectedValueOnce(coded('EACCES'));
    const { report } = await runReader(
      options({
        fetcher: {
          fetch: async (directory, signal) => {
            const fetched = await writeDump(directory, signal);
            await resources.cancel();
            return fetched;
          },
        },
      }),
      resources,
    );
    expect(report.cleanup).toEqual(
      expect.arrayContaining([
        "removing the run's containers failed (EACCES)",
        "removing the run's network failed (EACCES)",
      ]),
    );
  });

  it('reports a container it could not remove by its error code, and one already gone not at all', async () => {
    docker.restoreDump.mockResolvedValue(
      refuse('the mysql client exited with 1'),
    );
    mysql.stop.mockRejectedValue(coded('EBUSY'));
    postgres.stop.mockRejectedValue(
      Object.assign(new Error('gone'), { statusCode: 404 }),
    );
    const { report } = await runReader(options());
    expect(report.cleanup).toContain(
      'removing the MySQL container failed (EBUSY)',
    );
    expect(report.cleanup.join('\n')).not.toContain('Postgres');
  });
});

describe('what a run leaves behind', () => {
  const stray = [{ id: 'stray', run: 'other', pid: null }];

  it('removes a labelled container left after the release, and says so', async () => {
    docker.labelledContainers
      .mockResolvedValueOnce(stray)
      .mockResolvedValue([]);
    const { report } = await runReader(options());
    expect(report.problem).toBeNull();
    expect(report.cleanup).toContain(
      '1 labelled container(s) were left after the release and are removed',
    );
  });

  it('fails the run when a labelled container remains', async () => {
    docker.labelledContainers.mockResolvedValue(stray);
    const { report } = await runReader(options());
    expect(report.cleanup).toContain(
      'FAILED: 1 labelled container(s) remain after the run',
    );
    expect(report.problem).toBe(
      'cleanup: 1 labelled container(s) remain after the run',
    );
    expect(report.exitStatus).toBe(2);
  });

  it('removes a labelled network left after the release, and fails the run when one remains', async () => {
    docker.labelledNetworks.mockResolvedValue(stray);
    const { report } = await runReader(options());
    expect(report.cleanup).toEqual(
      expect.arrayContaining([
        '1 labelled network(s) were left after the release and are removed',
        'FAILED: 1 labelled network(s) remain after the run',
      ]),
    );
  });

  it('fails the run when Docker cannot be asked what remains', async () => {
    docker.labelledContainers.mockRejectedValue(coded('ECONNREFUSED'));
    docker.labelledNetworks.mockRejectedValue(coded('ECONNREFUSED'));
    const { report } = await runReader(options());
    expect(report.cleanup).toEqual(
      expect.arrayContaining([
        'checking for labelled containers failed (ECONNREFUSED)',
        'checking for labelled networks failed (ECONNREFUSED)',
        'FAILED: whether a labelled container remains is not known',
        'FAILED: whether a labelled network remains is not known',
      ]),
    );
    expect(report.exitStatus).toBe(2);
  });

  it('keeps the first problem of a failed run, not the cleanup', async () => {
    docker.restoreDump.mockResolvedValue(
      refuse('the mysql client exited with 1'),
    );
    docker.labelledContainers.mockResolvedValue(stray);
    const { report } = await runReader(options());
    expect(report.problem).toBe(
      'restoring the dump into MySQL: the dump did not load: the mysql client exited with 1',
    );
  });
});
