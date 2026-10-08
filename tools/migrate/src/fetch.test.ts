import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backupAge,
  backupTakenAt,
  BACKUP_BUCKET,
  findOciCli,
  latestBackup,
  ociFetcher,
  runToEnd,
} from './fetch';
import { ReaderProblem } from './problem';

describe('the backup the reader fetches', () => {
  it("comes from sportbet's bucket and prefix only", () => {
    expect(BACKUP_BUCKET).toEqual({
      bucket: 'sportbet-db-backup',
      namespace: 'axox7rtziknk',
      region: 'eu-stockholm-1',
      prefix: 'sportbet-web/',
    });
  });

  it('is the latest daily backup: the greatest matching name', () => {
    expect(
      latestBackup([
        'sportbet-web/sportbet-20260928T021702Z-daily.sql.gz',
        'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz',
        'sportbet-web/sportbet-20260927T021655Z-daily.sql.gz',
      ]),
    ).toBe('sportbet-web/sportbet-20260929T021708Z-daily.sql.gz');
  });

  it("ignores other tags, sportbet_new's own backups and anything else", () => {
    expect(
      latestBackup([
        'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz',
        'sportbet-web/sportbet-20260930T090000Z-predeploy.sql.gz',
        'sportbet-new/sportbet-20260930T021700Z-daily.sql.gz',
        'sportbet-web/sportbet-20260930T021700Z-daily.sql.gz.part',
        'sportbet-web/notes.txt',
      ]),
    ).toBe('sportbet-web/sportbet-20260929T021708Z-daily.sql.gz');
  });

  it('is none when no daily backup is listed', () => {
    expect(latestBackup(['sportbet-web/notes.txt'])).toBeUndefined();
  });

  it('was taken at the time its name gives, in UTC', () => {
    expect(
      backupTakenAt('sportbet-web/sportbet-20260929T021708Z-daily.sql.gz'),
    ).toEqual(new Date('2026-09-29T02:17:08Z'));
  });

  it('is a warning only once it is older than 26 hours', () => {
    const name = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';
    expect(backupAge(name, new Date('2026-09-30T04:17:08Z'))).toEqual({
      hours: 26,
      stale: false,
    });
    expect(backupAge(name, new Date('2026-09-30T05:17:08Z'))).toEqual({
      hours: 27,
      stale: true,
    });
  });
});

describe('a command the fetcher runs', () => {
  it('is not started once the run is interrupted', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      runToEnd(process.execPath, ['-e', ''], abort.signal),
    ).rejects.toThrow(new ReaderProblem('interrupted before it started'));
  });

  it('fails when the command cannot be started', async () => {
    await expect(
      runToEnd(
        join(tmpdir(), 'no-such-oci-cli'),
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/ENOENT/);
  });

  it('hands over its standard output', async () => {
    await expect(
      runToEnd(
        process.execPath,
        ['-e', 'process.stdout.write("listed")'],
        new AbortController().signal,
      ),
    ).resolves.toBe('listed');
  });

  it('says its exit code only, never its output', async () => {
    await expect(
      runToEnd(
        process.execPath,
        [
          '-e',
          'console.error("sentinel.ada@example.invalid"); process.exit(3)',
        ],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/^the OCI CLI exited with 3$/);
  });

  it('is killed on an interrupt, and settles only once it has exited, so its file can be deleted', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sportbet-fetch-test-'));
    const file = join(directory, 'backup.sql.gz');
    const abort = new AbortController();
    const writing = runToEnd(
      process.execPath,
      [
        '-e',
        `const fs = require('node:fs'); const fd = fs.openSync(${JSON.stringify(file)}, 'w'); setInterval(() => fs.writeSync(fd, 'x'), 10);`,
      ],
      abort.signal,
    );
    while (!existsSync(file)) await new Promise((r) => setTimeout(r, 20));
    abort.abort();
    await expect(writing).rejects.toThrow('interrupted');
    rmSync(directory, { recursive: true });
    expect(existsSync(directory)).toBe(false);
  });
});

describe('findOciCli: the OCI CLI the reader runs', () => {
  /** A machine where only `answering` replies to --version, and only `present` paths exist. */
  const machine = (
    answering: readonly string[],
    present: readonly string[] = [],
  ) => ({
    home: 'C:/Users/owner',
    exists: (path: string) => present.includes(path),
    answers: (candidate: string) =>
      Promise.resolve(answering.includes(candidate)),
  });

  it('fetch: OCI_CLI first, when it answers', async () => {
    expect(
      await findOciCli(
        { OCI_CLI: 'C:/oci/oci.exe' },
        machine(['C:/oci/oci.exe', 'oci'], ['C:/oci/oci.exe']),
      ),
    ).toBe('C:/oci/oci.exe');
  });

  it('fetch: then `oci` on the PATH', async () => {
    expect(await findOciCli({}, machine(['oci']))).toBe('oci');
    expect(await findOciCli({ OCI_CLI: '' }, machine(['oci']))).toBe('oci');
  });

  it('fetch: a path that does not exist is not run; then ~/bin/oci.exe', async () => {
    const home = join('C:/Users/owner', 'bin', 'oci.exe');
    const asked: string[] = [];
    const found = await findOciCli(
      { OCI_CLI: 'C:/missing/oci.exe' },
      {
        ...machine([home], [home]),
        answers: (candidate: string) => {
          asked.push(candidate);
          return Promise.resolve(candidate === home);
        },
      },
    );
    expect(found).toBe(home);
    expect(asked).toEqual(['oci', home]);
  });

  it('fetch: none answering is undefined', async () => {
    expect(await findOciCli({}, machine([]))).toBeUndefined();
  });
});

describe('ociFetcher: the latest backup through the OCI CLI', () => {
  const where = [
    '--bucket-name',
    BACKUP_BUCKET.bucket,
    '--namespace',
    BACKUP_BUCKET.namespace,
    '--region',
    BACKUP_BUCKET.region,
  ];

  // A path no CLI is at: should the fake runner ever be bypassed, nothing
  // runs, so no test can reach the bucket.
  const NO_CLI = join(tmpdir(), 'no-such-oci-cli');

  /** The CLI's answers: the listing, then nothing for the download. */
  const cli = (listing: unknown) => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run = (command: string, args: readonly string[]) => {
      calls.push({ command, args });
      return Promise.resolve(args[2] === 'list' ? JSON.stringify(listing) : '');
    };
    return { calls, run };
  };

  it("lists sportbet's backups, then downloads the latest into the directory", async () => {
    const { calls, run } = cli({
      data: [
        { name: 'sportbet-web/sportbet-20260928T021708Z-daily.sql.gz' },
        { name: 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz' },
      ],
    });
    const directory = join(tmpdir(), 'oci-fetch');
    const fetched = await ociFetcher(NO_CLI, run).fetch(
      directory,
      new AbortController().signal,
    );
    const path = join(directory, 'backup.sql.gz');
    expect(fetched).toEqual({
      objectName: 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz',
      path,
    });
    expect(calls).toEqual([
      {
        command: NO_CLI,
        args: [
          'os',
          'object',
          'list',
          '--prefix',
          BACKUP_BUCKET.prefix,
          '--all',
          '--output',
          'json',
          ...where,
        ],
      },
      {
        command: NO_CLI,
        args: [
          'os',
          'object',
          'get',
          '--name',
          'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz',
          '--file',
          path,
          ...where,
        ],
      },
    ]);
  });

  it('downloads nothing when no daily backup is listed', async () => {
    const { calls, run } = cli({});
    await expect(
      ociFetcher(NO_CLI, run).fetch(tmpdir(), new AbortController().signal),
    ).rejects.toThrow(
      new ReaderProblem(
        `no daily backup under ${BACKUP_BUCKET.bucket}/${BACKUP_BUCKET.prefix}`,
      ),
    );
    expect(calls).toHaveLength(1);
  });
});
