import { describe, expect, it } from 'vitest';
import { useTestDatabase, withDatabaseAt } from '../src/testing';
import { providedDatabaseUrl } from '../src/testing/database';

const connection = useTestDatabase();

// useTestDatabase truncates whatever it connects to: without a provided URL,
// pg would fall back to PG* variables or localhost, so it must refuse.
describe('providedDatabaseUrl', () => {
  it('passes a Postgres URL through', () => {
    const url = 'postgres://test:test@127.0.0.1:5432/test';
    expect(providedDatabaseUrl(url)).toBe(url);
  });

  it.each([
    ['nothing', undefined],
    ['an empty string', ''],
    ['a URL that is not Postgres', 'mysql://x@y/z'],
  ])('refuses %s, naming the global setup', (_, provided) => {
    expect(() => providedDatabaseUrl(provided)).toThrow(/startTestDatabase/);
  });
});

describe('withDatabaseAt', () => {
  const exists = async (url: string) =>
    (
      await connection.client.query(
        'select 1 from pg_database where datname = $1',
        [new URL(url).pathname.slice(1)],
      )
    ).rows.length === 1;

  it('hands over a database migrated through the first migrations only, and drops it afterwards', async () => {
    let url = '';
    let applied: unknown;
    await withDatabaseAt(connection, 2, async (database) => {
      url = database.url;
      applied = (
        await database.client.query(
          'select count(*)::int as applied from drizzle.__drizzle_migrations',
        )
      ).rows;
    });
    expect(url).not.toBe(connection.url);
    expect(applied).toEqual([{ applied: 2 }]);
    expect(await exists(url)).toBe(false);
  });

  it('drops the database even when the test using it fails', async () => {
    let url = '';
    await expect(
      withDatabaseAt(connection, 1, (database) => {
        url = database.url;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(await exists(url)).toBe(false);
  });
});
