import { expect, it } from 'vitest';
import { violatedUnique } from '../src/sql-state';

class DatabaseError extends Error {
  readonly code: string;
  readonly constraint: string | undefined;

  constructor(code: string, constraint?: string) {
    super('duplicate key value violates unique constraint');
    this.code = code;
    this.constraint = constraint;
  }
}

it("names the unique constraint a statement broke, through Drizzle's cause", () => {
  const wrapped = new Error('Failed query', {
    cause: new DatabaseError('23505', 'players_username_unique'),
  });
  expect(violatedUnique(wrapped)).toBe('players_username_unique');
  expect(violatedUnique(new DatabaseError('23505', 'players_pkey'))).toBe(
    'players_pkey',
  );
});

it('names nothing for any other failure', () => {
  expect(
    violatedUnique(new DatabaseError('23514', 'players_name_length')),
  ).toBeNull();
  expect(violatedUnique(new Error('connection lost'))).toBeNull();
  expect(violatedUnique('not an error')).toBeNull();
});
