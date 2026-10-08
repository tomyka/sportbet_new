import { existsSync } from 'node:fs';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  labelledContainers,
  labelledNetworks,
  postgresUrl,
  removeRunContainers,
  removeRunNetworks,
} from './containers';
import { describeProblem, ReaderProblem } from './problem';
import { emptyReport, exitStatusOf, type Report } from './report';
import { codeOf, remove, RunResources } from './run-resources';
import {
  checkFetched,
  fetchDump,
  loadAndCompare,
  mapCopies,
  preflight,
  readCopies,
  restore,
  stopMySql,
  type ReaderOptions,
  type Run,
} from './run-stages';

export {
  abandonedWorkspace,
  RunResources,
  WORKSPACE_PREFIX,
} from './run-resources';
export type { ReaderOptions } from './run-stages';

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

/** Every stage of the run, in order (src/run-stages.ts). */
async function readAndLoad(run: Run): Promise<void> {
  await preflight(run);
  const fetched = await fetchDump(run);
  checkFetched(run, fetched);
  const mysql = await restore(run, fetched);
  const copies = await readCopies(run, mysql);
  await stopMySql(run, mysql);
  const { mapped, oldAppMapped } = mapCopies(run, copies);
  await loadAndCompare(run, {
    backup: fetched.objectName,
    mapped,
    oldAppMapped,
    oldApp: copies.oldApp,
  });
  run.resources.checkpoint();
}

/** What the end of a run found: its failed steps and what remains. */
interface Leftovers {
  readonly errors: string[];
  readonly problems: string[];
}

/** The run's labelled containers left after the release, but `except`: removed, then counted again. */
async function containersLeft(
  run: Run,
  except: readonly string[],
  found: Leftovers,
): Promise<void> {
  const { id } = run.resources;
  try {
    const leftOf = async () =>
      (await labelledContainers(id))
        .map((container) => container.id)
        .filter((each) => !except.includes(each));
    let left = await leftOf();
    if (left.length > 0) {
      await removeRunContainers(id, except);
      run.progress.cleanup.push(
        `${String(left.length)} labelled container(s) were left after the release and are removed`,
      );
      left = await leftOf();
    }
    if (left.length > 0) {
      found.problems.push(
        `${String(left.length)} labelled container(s) remain after the run`,
      );
    }
  } catch (error) {
    found.errors.push(
      `checking for labelled containers failed (${codeOf(error)})`,
    );
    found.problems.push('whether a labelled container remains is not known');
  }
}

/**
 * The run's labelled networks: after the containers, as a network still in
 * use cannot be removed, so one that remains now is a real leftover.
 * Listed again after the removal, so the run fails if Docker kept one.
 */
async function networksLeft(run: Run, found: Leftovers): Promise<void> {
  const { id } = run.resources;
  try {
    const left = await labelledNetworks(id);
    if (left.length > 0) {
      await removeRunNetworks(id);
      run.progress.cleanup.push(
        `${String(left.length)} labelled network(s) were left after the release and are removed`,
      );
    }
    const remaining = await labelledNetworks(id);
    if (remaining.length > 0) {
      found.problems.push(
        `${String(remaining.length)} labelled network(s) remain after the run`,
      );
    }
  } catch (error) {
    found.errors.push(
      `checking for labelled networks failed (${codeOf(error)})`,
    );
    found.problems.push('whether a labelled network remains is not known');
  }
}

/** Each temporary directory the run made: deleted once more if it is still there. */
async function workspacesLeft(run: Run, found: Leftovers): Promise<void> {
  for (const workspace of run.progress.madeWorkspaces) {
    if (!existsSync(workspace)) continue;
    await remove(workspace).catch(() => undefined);
    if (existsSync(workspace)) {
      found.problems.push('the temporary directory holding the dump remains');
    }
  }
}

/** What the cleanup lines say once nothing remains. */
function cleanedUp(keep: boolean, parity: boolean): string[] {
  return [
    keep
      ? 'the dump, its temporary directory and the MySQL container are deleted; the Postgres container is kept (--keep)'
      : 'the dump, its temporary directory and both containers are deleted',
    ...(parity
      ? ["the old app's container and the private network are deleted"]
      : []),
  ];
}

/** The cleanup lines on the report; what remains is a problem of the run. */
function reportCleanup(run: Run, keep: boolean, found: Leftovers): void {
  const { progress } = run;
  progress.cleanup.push(...found.errors);
  if (found.problems.length === 0) {
    progress.cleanup.push(...cleanedUp(keep, run.options.parity !== undefined));
    return;
  }
  progress.cleanup.push(
    ...found.problems.map((problem) => `FAILED: ${problem}`),
  );
  progress.report = {
    ...progress.report,
    problem:
      progress.report.problem ??
      describeProblem('cleanup', new ReaderProblem(found.problems.join('; '))),
  };
}

/** The Postgres a --keep run leaves, and how to stop it. */
function keptDatabase(
  run: Run,
  kept: StartedPostgreSqlContainer | null,
): KeptDatabase | null {
  if (kept === null) return null;
  const { resources } = run;
  return {
    url: postgresUrl(kept),
    containerId: kept.getId(),
    stop: async () => {
      await resources.release();
      return (await labelledContainers(resources.id)).map(({ id }) => id);
    },
  };
}

/**
 * The end of every run, success, failure or interrupt: everything the run
 * made released (the Postgres kept on a clean --keep run), then checked
 * gone - containers, networks, the temporary directory - and the report
 * finished with its cleanup and its exit status.
 */
async function finish(run: Run): Promise<ReaderResult> {
  const { options, resources, progress } = run;
  const keep = options.keep && progress.report.problem === null;
  await resources.release({ keepPostgres: keep });
  const found: Leftovers = { errors: [...resources.failures], problems: [] };
  const kept = keep ? resources.postgres : null;
  await containersLeft(run, kept === null ? [] : [kept.getId()], found);
  await networksLeft(run, found);
  await workspacesLeft(run, found);
  reportCleanup(run, keep, found);
  const report = { ...progress.report, cleanup: progress.cleanup };
  return {
    report: { ...report, exitStatus: exitStatusOf(report) },
    kept: keptDatabase(run, kept),
  };
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
  const run: Run = {
    options,
    resources,
    progress: {
      report: emptyReport(),
      cleanup: [],
      stage: 'preflight',
      madeWorkspaces: [],
    },
  };
  try {
    await readAndLoad(run);
  } catch (error) {
    run.progress.report = {
      ...run.progress.report,
      problem: describeProblem(
        run.progress.stage,
        resources.cancelled
          ? new ReaderProblem('the run was interrupted')
          : error,
      ),
    };
  }
  return finish(run);
}
