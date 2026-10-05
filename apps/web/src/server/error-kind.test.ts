import { expect, it } from 'vitest';
import { errorKind } from './error-kind';

// Review W2: a log line names what failed, never what it failed on.

class DatabaseError extends Error {
  readonly code = '23505';
  constructor() {
    super(
      'duplicate key value violates unique constraint, Key (email)=(jonas@example.lt)',
    );
    this.name = 'DatabaseError';
  }
}

it('names an error by its kind only, never its message', () => {
  expect(errorKind(new TypeError('jonas@example.lt'))).toBe('TypeError');
});

it("adds Postgres's SQLSTATE, found on the error or on what it wraps, as Drizzle does", () => {
  expect(errorKind(new DatabaseError())).toBe('DatabaseError, SQLSTATE 23505');
  const wrapped = new Error(
    'Failed query: select ... params: jonas@example.lt',
    {
      cause: new DatabaseError(),
    },
  );
  wrapped.name = 'DrizzleQueryError';
  expect(errorKind(wrapped)).toBe('DrizzleQueryError, SQLSTATE 23505');
  expect(errorKind(wrapped)).not.toContain('@');
});

it('names anything thrown that is not an Error as unknown', () => {
  expect(errorKind('jonas@example.lt')).toBe('unknown error');
});
