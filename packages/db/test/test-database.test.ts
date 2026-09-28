import { describe, expect, it } from 'vitest';
import { providedDatabaseUrl } from '../src/testing/database';

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
