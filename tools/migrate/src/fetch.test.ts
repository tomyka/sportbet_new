import { describe, expect, it } from 'vitest';
import { backupAge, backupTakenAt, BACKUP_BUCKET, latestBackup } from './fetch';

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
