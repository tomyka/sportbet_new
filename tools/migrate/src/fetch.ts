import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

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
export const STALE_AFTER_HOURS = 26;

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
export interface FetchedBackup {
  readonly objectName: string;
  readonly path: string;
}

/**
 * Where the dump comes from: the reader's one seam. The real fetcher
 * downloads the latest backup with the OCI CLI; the tests hand over a
 * synthetic dump instead.
 */
export interface BackupFetcher {
  readonly fetch: (directory: string) => Promise<FetchedBackup>;
}

/**
 * The OCI CLI: `OCI_CLI` if set, else `oci` on the PATH, else
 * `~/bin/oci.exe` (where the owner's laptop has it). Undefined when none
 * answers.
 */
export async function findOciCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const candidates = [
    env['OCI_CLI'],
    'oci',
    join(homedir(), 'bin', 'oci.exe'),
  ].flatMap((candidate) =>
    candidate === undefined || candidate === '' ? [] : [candidate],
  );
  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (!existsSync(candidate)) continue;
    }
    try {
      await run(candidate, ['--version'], { windowsHide: true });
      return candidate;
    } catch {
      // Not this one: try the next.
    }
  }
  return undefined;
}

const objectList = z
  .object({
    data: z.array(z.object({ name: z.string() }).loose()).default([]),
  })
  .loose();

/** The fetcher that downloads the latest daily backup through the OCI CLI. */
export function ociFetcher(cli: string): BackupFetcher {
  const oci = (args: readonly string[]) =>
    run(
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
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
  return {
    fetch: async (directory) => {
      const listed = await oci([
        'list',
        '--prefix',
        BACKUP_BUCKET.prefix,
        '--all',
        '--output',
        'json',
      ]);
      const names = objectList
        .parse(JSON.parse(listed.stdout))
        .data.map(({ name }) => name);
      const objectName = latestBackup(names);
      if (objectName === undefined) {
        throw new Error(
          `no daily backup under ${BACKUP_BUCKET.bucket}/${BACKUP_BUCKET.prefix}`,
        );
      }
      const path = join(directory, 'backup.sql.gz');
      await oci(['get', '--name', objectName, '--file', path]);
      return { objectName, path };
    },
  };
}
