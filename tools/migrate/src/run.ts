import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { countStoredRows, createDb } from '@sportbet/db';
import { MIGRATIONS_FOLDER, runMigrations } from '@sportbet/db/migrations';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  getContainerRuntimeClient,
  type StartedTestContainer,
} from 'testcontainers';
import {
  imageExists,
  isAlive,
  isGone,
  labelledContainers,
  labelledNetworks,
  MYSQL_IMAGE,
  MYSQL_VERSION,
  mysqlConnection,
  postgresUrl,
  removeAbandonedContainers,
  removeAbandonedNetworks,
  removeRunContainers,
  removeRunNetworks,
  restoreDump,
  SPORTBET_APP_IMAGE,
  startMySql,
  startPostgres,
  stopSportbetApp,
} from './containers';
import { checkDump } from './dump';
import { backupAge, type BackupFetcher } from './fetch';
import { loadMapped, pointsRowCounts, recalculateLoaded } from './load';
import { environmentRefusal, runtimeRefusal } from './local-docker';
import { mapSportbet, type Mapped } from './map';
import type { OldAppRank } from './parity/rankings';
import { checkParity } from './parity/stage';
import { describeProblem, ReaderProblem, type Stage } from './problem';
import { reconcile } from './reconcile';
import { emptyReport, exitStatusOf, type Report } from './report';
import { runSportbetApp } from './sportbet-app';
import { openSportbet, readSportbet, schemaDrift } from './sportbet-read';

/** Every temporary directory the reader makes starts so, under the OS temp directory. */
export const WORKSPACE_PREFIX = 'sportbet-migrate-';

export interface ReaderOptions {
  /** Where the dump comes from: the reader's one seam. */
  readonly fetcher: BackupFetcher;
  /** Keep the loaded Postgres running after the report (`--keep`). */
  readonly keep: boolean;
  readonly now: () => Date;
  /**
   * `--parity --sportbet-tag <tag>`: compare the points with sportbet's
   * own recalculation of the copy, by its image at `tag` (spec 2.3).
   */
  readonly parity?: { readonly tag: string };
}

/** The Postgres a `--keep` run leaves running: no email or name in it. */
export interface KeptDatabase {
  readonly url: string;
  readonly containerId: string;
  /** Stops and removes it; resolves to the labelled containers left after. */
  readonly stop: () => Promise<string[]>;
}

export interface ReaderResult {
  readonly report: Report;
  readonly kept: KeptDatabase | null;
}

/** The code of a file-system error (EBUSY, EPERM), or the error's class. */
const codeOf = (error: unknown): string => {
  const code: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  if (typeof code === 'string' && /^[A-Z_]+$/.test(code)) return code;
  return error instanceof Error ? error.name : 'an unknown error';
};

/**
 * Deletes a file or directory, retrying while Windows still holds it
 * (EBUSY, EPERM: an antivirus scan, or a child that has only just exited).
 */
const remove = (path: string) =>
  rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

/** Waits for `pending` to settle, at most `ms`; never rejects. */
async function settled(pending: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    pending.catch(() => undefined),
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * What a run has made so far, so a failure or an interrupt removes it all;
 * and the run's interrupt, which the command raises on a signal.
 */
export class RunResources {
  /** The run's id: the value of its containers' label. */
  readonly id = randomBytes(8).toString('hex');
  workspace: string | null = null;
  dump: string | null = null;
  mysql: StartedMySqlContainer | null = null;
  postgres: StartedPostgreSqlContainer | null = null;
  /** The old app's container and the private network it shares with the MySQL (--parity). */
  sportbetApp: StartedTestContainer | null = null;
  network: string | null = null;
  readonly #interrupt = new AbortController();
  #fetching: Promise<unknown> | null = null;
  #releasing: Promise<unknown> = Promise.resolve();

  /** Aborted on an interrupt: the fetcher kills its download on it. */
  get signal(): AbortSignal {
    return this.#interrupt.signal;
  }

  get cancelled(): boolean {
    return this.#interrupt.signal.aborted;
  }

  /**
   * An interrupt: the download is killed, and whatever the run has made is
   * deleted at once - the dump, its directory and every container of this
   * run, including one whose start is still in flight - so a step waiting on
   * one fails fast. The run then stops at its next step and cleans up
   * again (runReader).
   */
  cancel(): Promise<string[]> {
    this.#interrupt.abort();
    return this.#serially(async () => {
      const errors = await this.#release(false);
      try {
        await removeRunContainers(this.id);
      } catch (error) {
        errors.push(`removing the run's containers failed (${codeOf(error)})`);
      }
      try {
        await removeRunNetworks(this.id);
      } catch (error) {
        errors.push(`removing the run's network failed (${codeOf(error)})`);
      }
      this.failures.push(...errors);
      return errors;
    });
  }

  /** Every cleanup step that failed so far, a signal's included. */
  readonly failures: string[] = [];

  /** Runs `cleanup` after every cleanup already queued: a signal's and the run's never race. */
  #serially(cleanup: () => Promise<string[]>): Promise<string[]> {
    const next = this.#releasing.then(cleanup);
    this.#releasing = next;
    return next;
  }

  /** Throws once the run is interrupted: checked between the run's steps. */
  checkpoint(): void {
    if (this.cancelled) throw new ReaderProblem('the run was interrupted');
  }

  /** The download in flight, which release waits for before deleting its file. */
  fetching<T>(download: Promise<T>): Promise<T> {
    this.#fetching = download;
    return download;
  }

  /**
   * Deletes the dump and the temporary directory and stops both containers
   * (the Postgres too unless `keepPostgres`), each step on its own so one
   * failing does not skip the rest; resolves to what failed, never
   * rejects (what failed is also kept in `failures`). Releases run one
   * after another, so a signal's and the run's own never race.
   */
  release({ keepPostgres = false } = {}): Promise<string[]> {
    return this.#serially(async () => {
      const errors = await this.#release(keepPostgres);
      this.failures.push(...errors);
      return errors;
    });
  }

  async #release(keepPostgres: boolean): Promise<string[]> {
    const errors: string[] = [];
    const step = async (what: string, action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        if (!isGone(error)) errors.push(`${what} failed (${codeOf(error)})`);
      }
    };
    if (this.#fetching !== null) await settled(this.#fetching, 30_000);
    const { dump, workspace, mysql, postgres, sportbetApp, network } = this;
    if (dump !== null) {
      await step('deleting the dump', () => remove(dump));
      this.dump = null;
    }
    if (workspace !== null) {
      await step('deleting the temporary directory', () => remove(workspace));
      this.workspace = null;
    }
    if (sportbetApp !== null) {
      await step("removing the old app's container", () =>
        stopSportbetApp(sportbetApp),
      );
      this.sportbetApp = null;
    }
    if (mysql !== null) {
      await step('removing the MySQL container', () =>
        mysql.stop({ remove: true, removeVolumes: true }),
      );
      this.mysql = null;
    }
    if (network !== null) {
      // Once nothing is on it: Docker refuses to remove a network in use.
      await step('removing the private network', () =>
        removeRunNetworks(this.id),
      );
      this.network = null;
    }
    if (postgres !== null && !keepPostgres) {
      await step('removing the Postgres container', () =>
        postgres.stop({ remove: true, removeVolumes: true }),
      );
      this.postgres = null;
    }
    return errors;
  }
}

/**
 * Whether a temporary directory was left by a crashed run: its name says
 * which process made it (`sportbet-migrate-<pid>-<random>`), and that
 * process is no longer running; a name that says none is a leftover too.
 */
export function abandonedWorkspace(
  name: string,
  alive: (pid: number) => boolean = isAlive,
): boolean {
  if (!name.startsWith(WORKSPACE_PREFIX)) return false;
  const pid = Number(/^(\d+)-/.exec(name.slice(WORKSPACE_PREFIX.length))?.[1]);
  return !(Number.isInteger(pid) && pid > 0 && alive(pid));
}

/**
 * Deletes the temporary directories and labelled containers a crashed run
 * left: those whose process is no longer running. A run still going - in
 * another terminal, or a `--keep` Postgres waiting for its Ctrl-C - keeps
 * its directory and containers.
 */
async function removeLeftovers(): Promise<string[]> {
  const directories = readdirSync(tmpdir()).filter((name) =>
    abandonedWorkspace(name),
  );
  for (const name of directories) await remove(join(tmpdir(), name));
  const containers = await removeAbandonedContainers();
  const networks = await removeAbandonedNetworks();
  return [
    `preflight removed ${String(directories.length)} leftover temporary directories and ${String(containers)} leftover containers`,
    ...(networks === 0
      ? []
      : [`preflight removed ${String(networks)} leftover networks`]),
  ];
}

/**
 * The production-copy reader (spec 2.2): check that Docker is on this PC,
 * fetch the latest backup, check it, restore it into a throwaway MySQL,
 * check the schema, read READ_COLUMNS only, map every value through the
 * domain, load a throwaway Postgres through the repositories, reconcile
 * each table's counts against the rows Postgres holds, recalculate under
 * both rule sets, report, and delete the dump and both containers -
 * on every path, success, failure or interrupt. It takes no database URL:
 * its only target is the Postgres container it starts itself.
 */
export async function runReader(
  options: ReaderOptions,
  resources: RunResources = new RunResources(),
): Promise<ReaderResult> {
  let report: Report = emptyReport();
  const cleanup: string[] = [];
  let stage: Stage = 'preflight';
  const madeWorkspaces: string[] = [];
  try {
    const refusal = environmentRefusal(process.env);
    if (refusal !== null) throw new ReaderProblem(refusal);
    const runtime = runtimeRefusal(await getContainerRuntimeClient());
    if (runtime !== null) throw new ReaderProblem(runtime);
    cleanup.push(...(await removeLeftovers()));
    if (options.parity !== undefined) {
      const image = `${SPORTBET_APP_IMAGE}:${options.parity.tag}`;
      if (!(await imageExists(image))) {
        throw new ReaderProblem(
          `the old app's image ${image} is not on this PC; build it first (README, parity)`,
        );
      }
    }
    resources.checkpoint();

    stage = 'fetch';
    const workspace = await mkdtemp(
      join(tmpdir(), `${WORKSPACE_PREFIX}${String(process.pid)}-`),
    );
    resources.workspace = workspace;
    madeWorkspaces.push(workspace);
    resources.checkpoint();
    const fetched = await resources.fetching(
      options.fetcher.fetch(workspace, resources.signal),
    );
    if (dirname(fetched.path) !== workspace) {
      throw new ReaderProblem('the fetcher wrote outside its directory');
    }
    resources.dump = fetched.path;
    resources.checkpoint();

    stage = 'check';
    const facts = checkDump(readFileSync(fetched.path), MYSQL_VERSION);
    if (!facts.ok) {
      throw new ReaderProblem(`the dump was refused: ${facts.refusal}`);
    }
    const age = backupAge(fetched.objectName, options.now());
    report = {
      ...report,
      dump: {
        object: fetched.objectName,
        bytes: facts.value.bytes,
        sha256: facts.value.sha256,
        ageHours: age.hours,
        stale: age.stale,
        engine: facts.value.engine,
        image: MYSQL_IMAGE,
      },
    };

    stage = 'start-mysql';
    resources.mysql = await startMySql(resources.id);
    stage = 'restore';
    resources.checkpoint();
    const restored = await restoreDump(resources.mysql, fetched.path);
    await remove(fetched.path);
    resources.dump = null;
    resources.checkpoint();
    if (!restored.ok) {
      throw new ReaderProblem(`the dump did not load: ${restored.refusal}`);
    }

    stage = 'schema';
    const connection = await openSportbet(mysqlConnection(resources.mysql));
    let read: Awaited<ReturnType<typeof readSportbet>>;
    let oldApp: {
      readonly rows: Awaited<ReturnType<typeof readSportbet>>['rows'];
      readonly ranks: readonly OldAppRank[];
    } | null = null;
    try {
      const drift = await schemaDrift(connection);
      if (drift.length > 0) {
        throw new ReaderProblem(
          `sportbet's schema drifted: ${drift.join('; ')}`,
        );
      }
      stage = 'read';
      read = await readSportbet(connection);
      if (options.parity !== undefined) {
        resources.checkpoint();
        stage = 'old-app';
        const ranks = await runSportbetApp(
          resources,
          options.parity.tag,
          resources.mysql,
        );
        resources.checkpoint();
        stage = 'read-old-app';
        oldApp = { rows: (await readSportbet(connection)).rows, ranks };
      }
    } finally {
      await connection.end();
    }
    await resources.mysql.stop({ remove: true, removeVolumes: true });
    resources.mysql = null;
    if (resources.network !== null) {
      await removeRunNetworks(resources.id);
      resources.network = null;
    }
    resources.checkpoint();

    stage = 'map';
    const mapped = mapSportbet(read.rows);
    const oldAppMapped: Mapped | null =
      oldApp === null ? null : mapSportbet(oldApp.rows);
    report = {
      ...report,
      tables: mapped.tables.map((table) => ({
        ...table,
        inDump: read.inDump.get(table.table) ?? 0,
      })),
      notices: mapped.notices,
    };

    stage = 'start-postgres';
    resources.postgres = await startPostgres(resources.id);
    stage = 'load';
    resources.checkpoint();
    const url = postgresUrl(resources.postgres);
    await runMigrations(url, MIGRATIONS_FOLDER);
    const { db, close } = createDb(url);
    try {
      await loadMapped(db, mapped);
      resources.checkpoint();
      stage = 'reconcile';
      const mismatches = reconcile(
        mapped.tables,
        await countStoredRows(db, 'production'),
      );
      if (mismatches.length > 0) {
        throw new ReaderProblem(
          `the load does not reconcile: ${mismatches.join('; ')}`,
        );
      }
      stage = 'recalculate';
      const tournaments = mapped.tournaments.map(
        ({ tournament }) => tournament,
      );
      const recalculations = await recalculateLoaded(db, tournaments);
      report = {
        ...report,
        recalculations,
        points: await pointsRowCounts(db, tournaments),
      };
      if (
        options.parity !== undefined &&
        oldApp !== null &&
        oldAppMapped !== null
      ) {
        resources.checkpoint();
        stage = 'parity';
        report = {
          ...report,
          parity: await checkParity(db, {
            tag: options.parity.tag,
            backup: fetched.objectName,
            mapped,
            oldApp: oldAppMapped,
            ranks: oldApp.ranks,
            recalculations,
          }),
        };
      }
    } finally {
      await close();
    }
    resources.checkpoint();
  } catch (error) {
    report = {
      ...report,
      problem: resources.cancelled
        ? describeProblem(stage, new ReaderProblem('the run was interrupted'))
        : describeProblem(stage, error),
    };
  }

  const keep = options.keep && report.problem === null;
  const problems: string[] = [];
  await resources.release({ keepPostgres: keep });
  const errors = [...resources.failures];
  const kept = keep ? resources.postgres : null;
  const except = kept === null ? [] : [kept.getId()];
  try {
    const leftOf = async () =>
      (await labelledContainers(resources.id))
        .map(({ id }) => id)
        .filter((id) => !except.includes(id));
    let left = await leftOf();
    if (left.length > 0) {
      await removeRunContainers(resources.id, except);
      cleanup.push(
        `${String(left.length)} labelled container(s) were left after the release and are removed`,
      );
      left = await leftOf();
    }
    if (left.length > 0) {
      problems.push(
        `${String(left.length)} labelled container(s) remain after the run`,
      );
    }
  } catch (error) {
    errors.push(`checking for labelled containers failed (${codeOf(error)})`);
    problems.push('whether a labelled container remains is not known');
  }
  // The networks after the containers: a network still in use cannot be
  // removed, so one that remains now is a real leftover. Listed again after
  // the removal, so the run fails if Docker kept one.
  try {
    const networksLeft = await labelledNetworks(resources.id);
    if (networksLeft.length > 0) {
      await removeRunNetworks(resources.id);
      cleanup.push(
        `${String(networksLeft.length)} labelled network(s) were left after the release and are removed`,
      );
    }
    const remaining = await labelledNetworks(resources.id);
    if (remaining.length > 0) {
      problems.push(
        `${String(remaining.length)} labelled network(s) remain after the run`,
      );
    }
  } catch (error) {
    errors.push(`checking for labelled networks failed (${codeOf(error)})`);
    problems.push('whether a labelled network remains is not known');
  }
  for (const workspace of madeWorkspaces) {
    if (existsSync(workspace)) {
      await remove(workspace).catch(() => undefined);
      if (existsSync(workspace)) {
        problems.push('the temporary directory holding the dump remains');
      }
    }
  }
  cleanup.push(...errors);
  if (problems.length === 0) {
    cleanup.push(
      keep
        ? 'the dump, its temporary directory and the MySQL container are deleted; the Postgres container is kept (--keep)'
        : 'the dump, its temporary directory and both containers are deleted',
    );
    if (options.parity !== undefined) {
      cleanup.push(
        "the old app's container and the private network are deleted",
      );
    }
  } else {
    cleanup.push(...problems.map((problem) => `FAILED: ${problem}`));
    report = {
      ...report,
      problem:
        report.problem ??
        describeProblem('cleanup', new ReaderProblem(problems.join('; '))),
    };
  }
  report = { ...report, cleanup };
  report = { ...report, exitStatus: exitStatusOf(report) };

  return {
    report,
    kept:
      kept === null
        ? null
        : {
            url: postgresUrl(kept),
            containerId: kept.getId(),
            stop: async () => {
              await resources.release();
              return (await labelledContainers(resources.id)).map(
                ({ id }) => id,
              );
            },
          },
  };
}
