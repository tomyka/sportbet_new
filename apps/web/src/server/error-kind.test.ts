import { describe, expect, it, vi } from 'vitest';
import { actionFailed, errorKind } from './error-kind';

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

describe('actionFailed (review W2: nothing personal leaves an action)', () => {
  it("logs the failure's kind only, and gives a bare error: no message, no cause", () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const typed = new Error('insert failed for ada@example.lt', {
      cause: Object.assign(new Error('duplicate key ada@example.lt'), {
        code: '23505',
      }),
    });
    const failed = actionFailed('sign-in', typed);
    expect(failed.message).toBe('sign-in: the action failed');
    expect(failed.cause).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'sign-in: the action failed (Error, SQLSTATE 23505)',
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('@');
    error.mockRestore();
  });
});
