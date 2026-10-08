import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { countStoredRows, createDb, type Db } from '@sportbet/db';
import { MIGRATIONS_FOLDER, runMigrations } from '@sportbet/db/migrations';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import { getContainerRuntimeClient } from 'testcontainers';
import {
  imageExists,
  MYSQL_IMAGE,
  MYSQL_VERSION,
  mysqlConnection,
  postgresUrl,
  removeRunNetworks,
  restoreDump,
  SPORTBET_APP_IMAGE,
  startMySql,
  startPostgres,
} from './containers';
import { checkDump } from './dump';
import { backupAge, type BackupFetcher } from './fetch';
import {
  loadMapped,
  pointsRowCounts,
  recalculateLoadedTimed,
  type Recalculation,
} from './load';
import { environmentRefusal, runtimeRefusal } from './local-docker';
import { mapSportbet, type Mapped } from './map';
import type { OldAppBoardRank, OldAppRank } from './parity/rankings';
import { checkParity } from './parity/stage';
import { ReaderProblem, type Stage } from './problem';
import { reconcile } from './reconcile';
import type { Report } from './report';
import {
  remove,
  removeLeftovers,
  WORKSPACE_PREFIX,
  type RunResources,
} from './run-resources';
import { runSportbetApp } from './sportbet-app';
import { openSportbet, readSportbet, schemaDrift } from './sportbet-read';

// The reader's stages, in the order a run takes them (runReader). Each
// sets the stage it is in, so a failure is reported where it happened.

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

/** What a run has done so far: its report, its cleanup lines, the stage it is in. */
interface Progress {
  report: Report;
  readonly cleanup: string[];
  stage: Stage;
  /** Every temporary directory the run made, checked again at the end. */
  readonly madeWorkspaces: string[];
}

/** One run: its options, what it has made, and how far it has got. */
export interface Run {
  readonly options: ReaderOptions;
  readonly resources: RunResources;
  readonly progress: Progress;
}

/** A dump the fetcher wrote into the run's workspace. */
interface Fetched {
  readonly objectName: string;
  readonly path: string;
}

type Read = Awaited<ReturnType<typeof readSportbet>>;

/** sportbet's own recalculated copy, its rankings and its /leaderboard (--parity). */
interface OldAppCopy {
  readonly rows: Read['rows'];
  readonly ranks: readonly OldAppRank[];
  readonly leaderboard: readonly OldAppBoardRank[];
}

/** --parity: the old app's image must already be on this PC (built, never pulled). */
async function checkParityImage(options: ReaderOptions): Promise<void> {
  if (options.parity === undefined) return;
  const image = `${SPORTBET_APP_IMAGE}:${options.parity.tag}`;
  if (!(await imageExists(image))) {
    throw new ReaderProblem(
      `the old app's image ${image} is not on this PC; build it first (README, parity)`,
    );
  }
}

/** Docker on this PC only; a crashed run's leftovers removed; the old app's image there. */
export async function preflight(run: Run): Promise<void> {
  const refusal = environmentRefusal(process.env);
  if (refusal !== null) throw new ReaderProblem(refusal);
  const runtime = runtimeRefusal(await getContainerRuntimeClient());
  if (runtime !== null) throw new ReaderProblem(runtime);
  run.progress.cleanup.push(...(await removeLeftovers()));
  await checkParityImage(run.options);
  run.resources.checkpoint();
}

/** The latest backup, fetched into a fresh workspace of this run. */
export async function fetchDump(run: Run): Promise<Fetched> {
  const { resources, progress } = run;
  progress.stage = 'fetch';
  const workspace = await mkdtemp(
    join(tmpdir(), `${WORKSPACE_PREFIX}${String(process.pid)}-`),
  );
  resources.workspace = workspace;
  progress.madeWorkspaces.push(workspace);
  resources.checkpoint();
  const fetched = await resources.fetching(
    run.options.fetcher.fetch(workspace, resources.signal),
  );
  if (dirname(fetched.path) !== workspace) {
    throw new ReaderProblem('the fetcher wrote outside its directory');
  }
  resources.dump = fetched.path;
  resources.checkpoint();
  return fetched;
}

/** The dump checked (checkDump), and its facts on the report. */
export function checkFetched(run: Run, fetched: Fetched): void {
  const { progress } = run;
  progress.stage = 'check';
  const facts = checkDump(readFileSync(fetched.path), MYSQL_VERSION);
  if (!facts.ok) {
    throw new ReaderProblem(`the dump was refused: ${facts.refusal}`);
  }
  const age = backupAge(fetched.objectName, run.options.now());
  progress.report = {
    ...progress.report,
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
}

/** The dump restored into a throwaway MySQL, then deleted. */
export async function restore(
  run: Run,
  fetched: Fetched,
): Promise<StartedMySqlContainer> {
  const { resources, progress } = run;
  progress.stage = 'start-mysql';
  const mysql = await startMySql(resources.id);
  resources.mysql = mysql;
  progress.stage = 'restore';
  resources.checkpoint();
  const restored = await restoreDump(mysql, fetched.path);
  await remove(fetched.path);
  resources.dump = null;
  resources.checkpoint();
  if (!restored.ok) {
    throw new ReaderProblem(`the dump did not load: ${restored.refusal}`);
  }
  return mysql;
}

/** --parity: sportbet's own app recalculates the copy, which is read again. */
async function readOldApp(
  run: Run,
  connection: Awaited<ReturnType<typeof openSportbet>>,
  mysql: StartedMySqlContainer,
): Promise<OldAppCopy | null> {
  const { options, resources, progress } = run;
  if (options.parity === undefined) return null;
  resources.checkpoint();
  progress.stage = 'old-app';
  const { ranks, leaderboard } = await runSportbetApp(
    resources,
    options.parity.tag,
    mysql,
  );
  resources.checkpoint();
  progress.stage = 'read-old-app';
  return { rows: (await readSportbet(connection)).rows, ranks, leaderboard };
}

/** sportbet's schema checked, its rows read; with --parity, its own recalculation too. */
export async function readCopies(
  run: Run,
  mysql: StartedMySqlContainer,
): Promise<{ read: Read; oldApp: OldAppCopy | null }> {
  run.progress.stage = 'schema';
  const connection = await openSportbet(mysqlConnection(mysql));
  try {
    const drift = await schemaDrift(connection);
    if (drift.length > 0) {
      throw new ReaderProblem(`sportbet's schema drifted: ${drift.join('; ')}`);
    }
    run.progress.stage = 'read';
    const read = await readSportbet(connection);
    return { read, oldApp: await readOldApp(run, connection, mysql) };
  } finally {
    await connection.end();
  }
}

/** The MySQL removed, and the private network with it once nothing is on it. */
export async function stopMySql(
  run: Run,
  mysql: StartedMySqlContainer,
): Promise<void> {
  const { resources } = run;
  await mysql.stop({ remove: true, removeVolumes: true });
  resources.mysql = null;
  if (resources.network !== null) {
    await removeRunNetworks(resources.id);
    resources.network = null;
  }
  resources.checkpoint();
}

/** Every value mapped through the domain; the tables' counts and notices on the report. */
export function mapCopies(
  run: Run,
  copies: { read: Read; oldApp: OldAppCopy | null },
): { mapped: Mapped; oldAppMapped: Mapped | null } {
  const { progress } = run;
  progress.stage = 'map';
  const mapped = mapSportbet(copies.read.rows);
  const inDump = (table: Mapped['tables'][number]['table']) =>
    copies.read.inDump.get(table) ?? 0;
  progress.report = {
    ...progress.report,
    tables: mapped.tables.map((table) => ({
      ...table,
      inDump: inDump(table.table),
    })),
    notices: mapped.notices,
  };
  return {
    mapped,
    oldAppMapped:
      copies.oldApp === null ? null : mapSportbet(copies.oldApp.rows),
  };
}

/** The loaded rows counted against the mapped ones: any mismatch stops the run. */
async function reconcileLoad(run: Run, db: Db, mapped: Mapped): Promise<void> {
  run.progress.stage = 'reconcile';
  const mismatches = reconcile(
    mapped.tables,
    await countStoredRows(db, 'production'),
  );
  if (mismatches.length > 0) {
    throw new ReaderProblem(
      `the load does not reconcile: ${mismatches.join('; ')}`,
    );
  }
}

/** Each loaded tournament recalculated under both rule sets; the times and counts reported. */
async function recalculate(
  run: Run,
  db: Db,
  mapped: Mapped,
): Promise<Recalculation[]> {
  const { progress } = run;
  progress.stage = 'recalculate';
  const tournaments = mapped.tournaments.map(({ tournament }) => tournament);
  const { recalculations, notices: timings } = await recalculateLoadedTimed(
    db,
    tournaments,
  );
  progress.report = {
    ...progress.report,
    notices: [...progress.report.notices, ...timings],
    recalculations,
    points: await pointsRowCounts(db, tournaments),
  };
  return recalculations;
}

/** What the parity stage compares: both mapped copies, sportbet's own ranks, the recalculations. */
interface ParitySides {
  readonly backup: string;
  readonly mapped: Mapped;
  readonly oldAppMapped: Mapped | null;
  readonly oldApp: OldAppCopy | null;
  readonly recalculations: readonly Recalculation[];
}

/** --parity: the loaded copy against sportbet's own recalculation. */
async function compareParity(
  run: Run,
  db: Db,
  sides: ParitySides,
): Promise<void> {
  const { options, resources, progress } = run;
  const { oldApp, oldAppMapped } = sides;
  if (
    options.parity === undefined ||
    oldApp === null ||
    oldAppMapped === null
  ) {
    return;
  }
  resources.checkpoint();
  progress.stage = 'parity';
  progress.report = {
    ...progress.report,
    parity: await checkParity(db, {
      tag: options.parity.tag,
      backup: sides.backup,
      mapped: sides.mapped,
      oldApp: oldAppMapped,
      ranks: oldApp.ranks,
      leaderboard: oldApp.leaderboard,
      recalculations: sides.recalculations,
    }),
  };
}

/**
 * A throwaway Postgres started and migrated, the mapped rows loaded and
 * reconciled, every tournament recalculated, and - with --parity -
 * compared with sportbet's own recalculation.
 */
export async function loadAndCompare(
  run: Run,
  sides: Omit<ParitySides, 'recalculations'>,
): Promise<void> {
  const { resources, progress } = run;
  progress.stage = 'start-postgres';
  const postgres = await startPostgres(resources.id);
  resources.postgres = postgres;
  progress.stage = 'load';
  resources.checkpoint();
  const url = postgresUrl(postgres);
  await runMigrations(url, MIGRATIONS_FOLDER);
  const { db, close } = createDb(url);
  try {
    await loadMapped(db, sides.mapped);
    resources.checkpoint();
    await reconcileLoad(run, db, sides.mapped);
    const recalculations = await recalculate(run, db, sides.mapped);
    await compareParity(run, db, { ...sides, recalculations });
  } finally {
    await close();
  }
}
