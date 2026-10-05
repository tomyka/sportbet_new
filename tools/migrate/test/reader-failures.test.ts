// The reader on every path that is not a clean run - a refused dump, a
// restore failure, schema drift, a fetcher that fails after writing, a
// failed load, an interrupt - and a clean run without --keep: each leaves
// no dump, no temporary directory and no labelled container, exits as
// documented, and prints no sentinel and no `@`. The dump is the synthetic
// one; never production data.

import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { GOLDEN } from '@sportbet/domain/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Load from '../src/load';
import type { BackupFetcher } from '../src/fetch';
import { renderReport } from '../src/report';
import {
  RunResources,
  runReader,
  WORKSPACE_PREFIX,
  type ReaderResult,
} from '../src/run';
import { renderDump, SENTINELS, syntheticDump } from './fixtures/sportbet-dump';
import { leftoverContainer } from './support/reader-containers';

/** Which constraint the next load trips after writing, if any. */
type LoadFailure = 'username' | 'email' | null;

/**
 * Whether the next load fails after writing (a real statement Postgres
 * refuses), or leaves one row fewer than it counted (a mismatch the
 * reconciliation must catch).
 */
const failing = vi.hoisted((): { load: LoadFailure; loseRow: boolean } => ({
  load: null,
  loseRow: false,
}));

vi.mock('../src/load', async (importOriginal) => {
  const actual = await importOriginal<typeof Load>();
  return {
    ...actual,
    loadMapped: async (...args: Parameters<typeof Load.loadMapped>) => {
      await actual.loadMapped(...args);
      if (failing.load === 'username') {
        // A duplicate username: the driver's detail quotes it.
        await args[0].execute(
          "insert into players (username, email, name, surname) select username, 'x' || email, name, surname from players order by id limit 1",
        );
      }
      if (failing.load === 'email') {
        // A second spelling of an address: the detail quotes the folded address.
        await args[0].execute(
          "insert into players (username, email, name, surname) select username || '-2', email, name, surname from players order by id limit 1",
        );
      }
      if (failing.loseRow) {
        await args[0].execute(
          "delete from game_odds where source = 'production' and game_id = (select min(game_id) from game_odds)",
        );
      }
    },
  };
});

const OBJECT = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';

const labelled = () =>
  execFileSync(
    'docker',
    ['ps', '-a', '-q', '--filter', 'label=sportbet-migrate'],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
const workspaces = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith(WORKSPACE_PREFIX));

/** A fetcher that writes `text`, gzipped, as the downloaded backup. */
const writing =
  (text: string): BackupFetcher['fetch'] =>
  (directory) => {
    const path = join(directory, 'backup.sql.gz');
    writeFileSync(path, gzipSync(text));
    return Promise.resolve({ objectName: OBJECT, path });
  };

const dump = () => renderDump(syntheticDump());

/** The dump with a statement the mysql client refuses, quoting sentinels near it. */
const unloadable = () =>
  dump().replace(
    'SET UNIQUE_CHECKS = 1;',
    "INSERT INTO `users` (`name`, `email`) VALUES ('Sentinel-Name-ada', 'sentinel.ada@example.invalid',,);\nSET UNIQUE_CHECKS = 1;",
  );

/** The dump with `users.username` nullable: drift from sportbet at 1ac955f. */
const drifted = () => {
  const text = dump();
  const column = '`username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL';
  if (!text.includes(column)) throw new Error('fixture: no username column');
  return text.replace(
    column,
    '`username` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL',
  );
};

interface Case {
  readonly name: string;
  readonly fetch: (resources: RunResources) => BackupFetcher['fetch'];
  readonly problem: RegExp;
  readonly loadFails?: 'username' | 'email';
  readonly loadLosesRow?: boolean;
}

const CASES: readonly Case[] = [
  {
    name: 'a refused dump (incomplete)',
    fetch: () => writing(renderDump(syntheticDump(), { complete: false })),
    problem: /^checking the dump: the dump was refused: incomplete$/,
  },
  {
    name: 'a restore failure',
    fetch: () => writing(unloadable()),
    problem:
      /^restoring the dump into MySQL: the dump did not load: the mysql client exited with 1 at dump line \d+$/,
  },
  {
    name: 'schema drift',
    fetch: () => writing(drifted()),
    problem:
      /^checking sportbet's schema: sportbet's schema drifted: users\.username: expected not null, found nullable$/,
  },
  {
    name: 'a fetcher that writes, then throws',
    fetch: () => async (directory) => {
      await writing(dump())(directory, new AbortController().signal);
      throw new Error('Sentinel-Name-ada sentinel.ada@example.invalid');
    },
    problem: /^fetching the backup: Error$/,
  },
  {
    name: 'an exception during load',
    fetch: () => writing(dump()),
    loadFails: 'username',
    problem:
      /^loading Postgres: a query failed: insert into players, SQLSTATE 23505, table players, constraint players_username_unique$/,
  },
  {
    name: 'a load where two players share an address once accents are dropped',
    fetch: () => writing(dump()),
    loadFails: 'email',
    problem:
      /^loading Postgres: a query failed: insert into players, SQLSTATE 23505, table players, constraint players_email_folded_unique$/,
  },
  {
    name: 'a load that leaves other rows than it counted',
    fetch: () => writing(dump()),
    loadLosesRow: true,
    problem:
      /^reconciling the load: the load does not reconcile: game_odds: loaded 4, but Postgres holds 3 \(game_odds, production\)$/,
  },
  {
    name: 'an interrupt while the dump downloads',
    fetch: (resources) => async (directory, signal) => {
      await writing(dump())(directory, signal);
      setTimeout(() => void resources.cancel(), 50);
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('Sentinel-Name-ada: aborted'));
        });
      });
    },
    problem: /^fetching the backup: the run was interrupted$/,
  },
  {
    name: 'an interrupt while the MySQL container starts',
    fetch: (resources) => async (directory, signal) => {
      const fetched = await writing(dump())(directory, signal);
      setTimeout(() => void resources.cancel(), 1_500);
      return fetched;
    },
    problem:
      /^(starting the MySQL container|restoring the dump into MySQL): the run was interrupted$/,
  },
];

/** Runs the reader, capturing everything it and the test print. */
async function run(
  fetch: (resources: RunResources) => BackupFetcher['fetch'],
  keep: boolean,
): Promise<{ result: ReaderResult; output: string }> {
  let output = '';
  const capture = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  const resources = new RunResources();
  try {
    const result = await runReader(
      {
        fetcher: { fetch: fetch(resources) },
        keep,
        now: () => new Date('2026-09-29T12:00:00Z'),
      },
      resources,
    );
    process.stdout.write(renderReport(result.report));
    process.stdout.write(JSON.stringify(result.report));
    return { result, output };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

/** No sentinel, no `@`, and no loaded username in `text`. */
const leaks = (text: string) => [
  ...SENTINELS.filter((sentinel) => text.includes(sentinel)),
  ...(text.includes('@') ? ['@'] : []),
];

afterEach(() => {
  failing.load = null;
  failing.loseRow = false;
  vi.unstubAllEnvs();
});

describe('the reader on a path that is not a clean run', () => {
  it.each(CASES)(
    '$name: deletes the dump and every container, exits 2, and prints nothing personal',
    async ({ fetch, problem, loadFails, loadLosesRow = false }) => {
      failing.load = loadFails ?? null;
      failing.loseRow = loadLosesRow;
      const { result, output } = await run(fetch, true);
      expect(result.report.problem).toMatch(problem);
      expect(result.report.exitStatus).toBe(2);
      expect(result.kept).toBeNull();
      expect(workspaces()).toEqual([]);
      expect(labelled()).toBe('');
      expect(leaks(output)).toEqual([]);
      expect(leaks(result.report.problem ?? '')).toEqual([]);
      const usernames = GOLDEN.players.filter((player) =>
        (result.report.problem ?? '').includes(player),
      );
      expect(usernames).toEqual([]);
    },
  );

  it('refuses a remote DOCKER_HOST before anything is fetched', async () => {
    vi.stubEnv('DOCKER_HOST', 'tcp://203.0.113.5:2375');
    const fetch = vi.fn<BackupFetcher['fetch']>();
    const { result } = await run(() => fetch, false);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.report.problem).toBe(
      'preflight: DOCKER_HOST points at a Docker daemon that is not on this PC',
    );
    expect(result.report.exitStatus).toBe(2);
    expect(workspaces()).toEqual([]);
  });
});

describe("the preflight's removal of leftovers", () => {
  it("removes a crashed run's container, and keeps one of a run still going (another terminal's --keep Postgres)", async () => {
    const live = await leftoverContainer(process.pid);
    const crashed = await leftoverContainer(2_147_483_000);
    try {
      const { result } = await run(
        () => writing(renderDump(syntheticDump(), { complete: false })),
        false,
      );
      expect(result.report.cleanup[0]).toBe(
        'preflight removed 0 leftover temporary directories and 1 leftover containers',
      );
      expect(labelled()).toBe(live.getId().slice(0, 12));
    } finally {
      await live.stop({ remove: true });
      await crashed.stop({ remove: true }).catch(() => undefined);
    }
    expect(labelled()).toBe('');
  });
});

describe('a clean run without --keep', () => {
  it('reports, keeps nothing, and leaves no dump and no container', async () => {
    const { result, output } = await run(() => writing(dump()), false);
    expect(result.report.problem).toBeNull();
    expect(result.report.exitStatus).toBe(1);
    expect(result.kept).toBeNull();
    expect(result.report.cleanup.at(-1)).toBe(
      'the dump, its temporary directory and both containers are deleted',
    );
    expect(workspaces()).toEqual([]);
    expect(labelled()).toBe('');
    expect(leaks(output)).toEqual([]);
  });
});
