import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedTestContainer } from 'testcontainers';
import {
  isAlive,
  isGone,
  removeAbandonedContainers,
  removeAbandonedNetworks,
  removeRunContainers,
  removeRunNetworks,
  stopSportbetApp,
} from './containers';
import { ReaderProblem } from './problem';

// What a reader run makes - its workspace, the dump, the containers and
// the network - and how it is released on every path.

/** Every temporary directory the reader makes starts so, under the OS temp directory. */
export const WORKSPACE_PREFIX = 'sportbet-migrate-';

/** The code of a file-system error (EBUSY, EPERM), or the error's class. */
export const codeOf = (error: unknown): string => {
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
export const remove = (path: string): Promise<void> =>
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

/** One cleanup step's failure, as the report says it; null when it worked or the thing was gone. */
async function attempt(
  what: string,
  action: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    return isGone(error) ? null : `${what} failed (${codeOf(error)})`;
  }
}

/** One thing a run holds: what freeing it is called, how, and forgetting it. */
interface Held {
  readonly what: string;
  readonly free: () => Promise<unknown>;
  readonly forget: () => void;
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
    if (this.#fetching !== null) await settled(this.#fetching, 30_000);
    const errors: string[] = [];
    for (const held of this.#held(keepPostgres)) {
      const failure = await attempt(held.what, held.free);
      if (failure !== null) errors.push(failure);
      held.forget();
    }
    return errors;
  }

  /**
   * What the run holds now, in the order it is freed: the files first, the
   * containers, the network once nothing is on it (Docker refuses to remove
   * a network in use), the Postgres last unless it is kept.
   */
  #held(keepPostgres: boolean): Held[] {
    return [...this.#heldFiles(), ...this.#heldContainers(keepPostgres)];
  }

  #heldFiles(): Held[] {
    const { dump, workspace } = this;
    const held: Held[] = [];
    if (dump !== null) {
      held.push({
        what: 'deleting the dump',
        free: () => remove(dump),
        forget: () => {
          this.dump = null;
        },
      });
    }
    if (workspace !== null) {
      held.push({
        what: 'deleting the temporary directory',
        free: () => remove(workspace),
        forget: () => {
          this.workspace = null;
        },
      });
    }
    return held;
  }

  #heldContainers(keepPostgres: boolean): Held[] {
    const { mysql, postgres, sportbetApp, network } = this;
    return [
      ...(sportbetApp === null
        ? []
        : [
            {
              what: "removing the old app's container",
              free: () => stopSportbetApp(sportbetApp),
              forget: () => {
                this.sportbetApp = null;
              },
            },
          ]),
      ...(mysql === null
        ? []
        : [
            {
              what: 'removing the MySQL container',
              free: () => mysql.stop({ remove: true, removeVolumes: true }),
              forget: () => {
                this.mysql = null;
              },
            },
          ]),
      ...this.#heldNetworkAndPostgres(network, keepPostgres ? null : postgres),
    ];
  }

  #heldNetworkAndPostgres(
    network: string | null,
    postgres: StartedPostgreSqlContainer | null,
  ): Held[] {
    const held: Held[] = [];
    if (network !== null) {
      held.push({
        what: 'removing the private network',
        free: () => removeRunNetworks(this.id),
        forget: () => {
          this.network = null;
        },
      });
    }
    if (postgres !== null) {
      held.push({
        what: 'removing the Postgres container',
        free: () => postgres.stop({ remove: true, removeVolumes: true }),
        forget: () => {
          this.postgres = null;
        },
      });
    }
    return held;
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
export async function removeLeftovers(): Promise<string[]> {
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
