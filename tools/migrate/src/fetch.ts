import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { ReaderProblem } from './problem';

const run = promisify(execFile);

/**
 * Where sportbet's nightly backups are (spec 2.2, production facts): the
 * only place the reader obtains production data from. The same bucket also
 * holds sportbet_new's own `sportbet-new/` backups, which it never touches.
 */
export const BACKUP_BUCKET = Object.freeze({
  bucket: 'sportbet-db-backup',
  namespace: 'axox7rtziknk',
  region: 'eu-stockholm-1',
  prefix: 'sportbet-web/',
});

/** A daily backup's object name; the names sort by the time they were taken. */
const DAILY =
  /^sportbet-web\/sportbet-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-daily\.sql\.gz$/;

/** A backup older than this is a warning (the old app's own backup check uses the same bound). */
const STALE_AFTER_HOURS = 26;

/** The latest daily backup among the listed object names, if there is one. */
export function latestBackup(names: readonly string[]): string | undefined {
  return names
    .filter((name) => DAILY.test(name))
    .sort()
    .at(-1);
}

/** When a daily backup was taken, from its name. */
export function backupTakenAt(name: string): Date {
  const parts = DAILY.exec(name)?.slice(1).map(Number);
  if (parts === undefined) throw new Error(`not a daily backup: ${name}`);
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] =
    parts;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/** How old a backup is at `now`, in whole hours, and whether that is stale. */
export function backupAge(
  name: string,
  now: Date,
): { readonly hours: number; readonly stale: boolean } {
  const hours = Math.floor(
    (now.getTime() - backupTakenAt(name).getTime()) / 3_600_000,
  );
  return { hours, stale: hours > STALE_AFTER_HOURS };
}

/** A backup downloaded into the reader's private temporary directory. */
interface FetchedBackup {
  readonly objectName: string;
  readonly path: string;
}

/**
 * Where the dump comes from: the reader's one seam. The real fetcher
 * downloads the latest backup with the OCI CLI; the tests hand over a
 * synthetic dump instead. On `signal` (an interrupt) it stops at once,
 * and settles only when nothing it started can still write the file.
 */
export interface BackupFetcher {
  readonly fetch: (
    directory: string,
    signal: AbortSignal,
  ) => Promise<FetchedBackup>;
}

/** Ends a child and every process it started (`oci.exe` is a launcher on Windows). */
function killTree(pid: number | undefined, kill: () => void): void {
  if (process.platform === 'win32' && pid !== undefined) {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', kill);
    return;
  }
  kill();
}

/**
 * Runs a command to its end and hands over its standard output. On
 * `signal` the command and its children are killed; either way the
 * promise settles only once the command has exited, so a file it was
 * writing can be deleted after. A failure says the exit code only: the
 * CLI's own text is not the reader's to print.
 */
export function runToEnd(
  command: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ReaderProblem('interrupted before it started'));
      return;
    }
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    const abort = () => {
      killTree(child.pid, () => child.kill('SIGKILL'));
    };
    signal.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new ReaderProblem('interrupted'));
      else if (code === 0) resolve(stdout);
      else {
        reject(
          new ReaderProblem(`the OCI CLI exited with ${String(code ?? -1)}`),
        );
      }
    });
  });
}

/** What findOciCli asks of the machine: real by default, faked in tests. */
export interface OciMachine {
  /** The user's home directory. */
  readonly home: string;
  readonly exists: (path: string) => boolean;
  /** Whether `candidate --version` runs. */
  readonly answers: (candidate: string) => Promise<boolean>;
}

const THIS_MACHINE: OciMachine = {
  home: homedir(),
  exists: existsSync,
  answers: (candidate) =>
    run(candidate, ['--version'], { windowsHide: true }).then(
      () => true,
      () => false,
    ),
};

/** A candidate written as a path: run only when the file is there. */
const isPath = (candidate: string): boolean =>
  candidate.includes('/') || candidate.includes('\\');

/**
 * The OCI CLI: `OCI_CLI` if set, else `oci` on the PATH, else
 * `~/bin/oci.exe` (where the owner's laptop has it). Undefined when none
 * answers.
 */
export async function findOciCli(
  env: NodeJS.ProcessEnv = process.env,
  machine: OciMachine = THIS_MACHINE,
): Promise<string | undefined> {
  const candidates = [
    env['OCI_CLI'],
    'oci',
    join(machine.home, 'bin', 'oci.exe'),
  ].filter((candidate): candidate is string => (candidate ?? '') !== '');
  for (const candidate of candidates) {
    if (isPath(candidate) && !machine.exists(candidate)) continue;
    if (await machine.answers(candidate)) return candidate;
  }
  return undefined;
}

const objectList = z
  .object({
    data: z.array(z.object({ name: z.string() }).loose()).default([]),
  })
  .loose();

/**
 * The fetcher that downloads the latest daily backup through the OCI CLI,
 * each command run by `runCommand` (a fake in the tests).
 */
export function ociFetcher(
  cli: string,
  runCommand: typeof runToEnd = runToEnd,
): BackupFetcher {
  const oci = (args: readonly string[], signal: AbortSignal) =>
    runCommand(
      cli,
      [
        'os',
        'object',
        ...args,
        '--bucket-name',
        BACKUP_BUCKET.bucket,
        '--namespace',
        BACKUP_BUCKET.namespace,
        '--region',
        BACKUP_BUCKET.region,
      ],
      signal,
    );
  return {
    fetch: async (directory, signal) => {
      const listed = await oci(
        ['list', '--prefix', BACKUP_BUCKET.prefix, '--all', '--output', 'json'],
        signal,
      );
      const names = objectList
        .parse(JSON.parse(listed))
        .data.map(({ name }) => name);
      const objectName = latestBackup(names);
      if (objectName === undefined) {
        throw new ReaderProblem(
          `no daily backup under ${BACKUP_BUCKET.bucket}/${BACKUP_BUCKET.prefix}`,
        );
      }
      const path = join(directory, 'backup.sql.gz');
      await oci(['get', '--name', objectName, '--file', path], signal);
      return { objectName, path };
    },
  };
}
