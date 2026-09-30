import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backupAge,
  backupTakenAt,
  BACKUP_BUCKET,
  latestBackup,
  runToEnd,
} from './fetch';

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
