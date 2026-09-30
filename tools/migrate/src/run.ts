import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@sportbet/db';
import { MIGRATIONS_FOLDER, runMigrations } from '@sportbet/db/migrations';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';
import {
  labelledContainers,
  MYSQL_IMAGE,
  MYSQL_VERSION,
  mysqlConnection,
  postgresUrl,
  removeLabelledContainers,
  restoreDump,
  startMySql,
  startPostgres,
} from './containers';
import { checkDump } from './dump';
import { backupAge, type BackupFetcher } from './fetch';
import { loadMapped, pointsRowCounts, recalculateLoaded } from './load';
import { mapSportbet } from './map';
import { emptyReport, exitStatusOf, type Report } from './report';
import { openSportbet, readSportbet, schemaDrift } from './sportbet-read';

/** Every temporary directory the reader makes starts so, under the OS temp directory. */
export const WORKSPACE_PREFIX = 'sportbet-migrate-';

export interface ReaderOptions {
  /** Where the dump comes from: the reader's one seam. */
  readonly fetcher: BackupFetcher;
  /** Keep the loaded Postgres running after the report (`--keep`). */
  readonly keep: boolean;
  readonly now: () => Date;
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

/** What a run has made so far, so a failure or an interrupt removes it all. */
export class RunResources {
  workspace: string | null = null;
  dump: string | null = null;
  mysql: StartedMySqlContainer | null = null;
  postgres: StartedPostgreSqlContainer | null = null;

  /** Deletes the dump and the temporary directory, and stops both containers. */
  async release({ keepPostgres = false } = {}): Promise<void> {
    if (this.dump !== null) rmSync(this.dump, { force: true });
    this.dump = null;
    if (this.workspace !== null) {
      rmSync(this.workspace, { recursive: true, force: true });
    }
    this.workspace = null;
    await this.mysql?.stop({ remove: true, removeVolumes: true });
    this.mysql = null;
    if (!keepPostgres) {
      await this.postgres?.stop({ remove: true, removeVolumes: true });
      this.postgres = null;
    }
  }
}

/** Deletes the temporary directories and labelled containers a crashed run left. */
async function removeLeftovers(): Promise<string[]> {
  const directories = readdirSync(tmpdir()).filter((name) =>
    name.startsWith(WORKSPACE_PREFIX),
  );
  for (const name of directories) {
    rmSync(join(tmpdir(), name), { recursive: true, force: true });
  }
  const containers = await removeLabelledContainers();
  return [
    `preflight removed ${String(directories.length)} leftover temporary directories and ${String(containers)} leftover containers`,
  ];
}

/** The first line of an error's message: never a row value (the reader's own messages name none). */
const describe = (error: unknown) =>
  error instanceof Error
    ? `${error.name}: ${error.message.split('\n')[0] ?? ''}`
    : 'an unknown error';

/**
 * The production-copy reader (spec 2.2): fetch the latest backup, check it,
 * restore it into a throwaway MySQL, check the schema, read READ_COLUMNS
 * only, map every value through the domain, load a throwaway Postgres
 * through the repositories, recalculate under both rule sets, report, and
 * delete the dump and both containers. It takes no database URL: its only
 * target is the Postgres container it starts itself.
 */
export async function runReader(
  options: ReaderOptions,
  resources: RunResources = new RunResources(),
): Promise<ReaderResult> {
  let report: Report = emptyReport();
  const cleanup: string[] = [];
  try {
    await getContainerRuntimeClient();
    cleanup.push(...(await removeLeftovers()));

    resources.workspace = mkdtempSync(join(tmpdir(), WORKSPACE_PREFIX));
    const fetched = await options.fetcher.fetch(resources.workspace);
    resources.dump = fetched.path;
    const facts = checkDump(readFileSync(fetched.path), MYSQL_VERSION);
    if (!facts.ok) {
      throw new Error(`the dump was refused: ${facts.refusal}`);
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

    resources.mysql = await startMySql();
    const restored = await restoreDump(resources.mysql, fetched.path);
    rmSync(fetched.path, { force: true });
    resources.dump = null;
    if (!restored.ok) {
      throw new Error(`the dump did not load: ${restored.refusal}`);
    }
    const connection = await openSportbet(mysqlConnection(resources.mysql));
    let read: Awaited<ReturnType<typeof readSportbet>>;
    try {
      const drift = await schemaDrift(connection);
      if (drift.length > 0) {
        throw new Error(`sportbet's schema drifted: ${drift.join('; ')}`);
      }
      read = await readSportbet(connection);
    } finally {
      await connection.end();
    }
    await resources.mysql.stop({ remove: true, removeVolumes: true });
    resources.mysql = null;

    const mapped = mapSportbet(read.rows);
    report = {
      ...report,
      tables: mapped.tables.map((table) => ({
        ...table,
        inDump: read.inDump.get(table.table) ?? 0,
      })),
      notices: mapped.notices,
    };

    resources.postgres = await startPostgres();
    const url = postgresUrl(resources.postgres);
    await runMigrations(url, MIGRATIONS_FOLDER);
    const { db, close } = createDb(url);
    try {
      await loadMapped(db, mapped);
      const tournaments = mapped.tournaments.map(
        ({ tournament }) => tournament,
      );
      const recalculations = await recalculateLoaded(db, tournaments);
      report = {
        ...report,
        recalculations,
        points: await pointsRowCounts(db, tournaments),
      };
    } finally {
      await close();
    }
  } catch (error) {
    report = { ...report, problem: describe(error) };
  }

  const keep = options.keep && report.problem === null;
  try {
    await resources.release({ keepPostgres: keep });
  } catch (error) {
    report = { ...report, problem: report.problem ?? describe(error) };
  }
  const leftovers = await labelledContainers();
  const expected = keep && resources.postgres !== null ? 1 : 0;
  cleanup.push(
    keep
      ? 'the dump, its temporary directory and the MySQL container are deleted; the Postgres container is kept (--keep)'
      : 'the dump, its temporary directory and both containers are deleted',
  );
  if (leftovers.length !== expected) {
    report = {
      ...report,
      problem:
        report.problem ??
        `${String(leftovers.length - expected)} labelled container(s) remain after the run`,
    };
  }
  report = { ...report, cleanup };
  report = { ...report, exitStatus: exitStatusOf(report) };

  const postgres = keep ? resources.postgres : null;
  return {
    report,
    kept:
      postgres === null
        ? null
        : {
            url: postgresUrl(postgres),
            containerId: postgres.getId(),
            stop: async () => {
              await resources.release();
              return labelledContainers();
            },
          },
  };
}
