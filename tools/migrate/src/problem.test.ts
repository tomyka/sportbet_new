import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { READ_COLUMNS } from './read-columns';
import { describeProblem, ReaderProblem, scrubbed } from './problem';

/** A failed query as Drizzle throws one: the statement, its values, the driver's error. */
class DrizzleQueryError extends Error {
  override readonly name = 'DrizzleQueryError';
  readonly query: string;
  readonly params: unknown[];
  constructor(query: string, params: unknown[], cause: unknown) {
    super(`Failed query: ${query}\nparams: ${params.join(',')}`, { cause });
    this.query = query;
    this.params = params;
  }
}

const zodErrorOf = (schema: z.ZodType, value: unknown): unknown => {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error('expected a failure');
  return parsed.error;
};

describe('a reported problem', () => {
  it("is the reader's own message as it wrote it, after the stage", () => {
    expect(
      describeProblem(
        'restore',
        new ReaderProblem('the mysql client exited with 1 at dump line 57'),
      ),
    ).toBe(
      'restoring the dump into MySQL: the mysql client exited with 1 at dump line 57',
    );
  });

  it("holds no player id: a repository's stored-row key is dropped", () => {
    expect(
      describeProblem(
        'load',
        new Error(
          'survival_picks 12: the domain refuses the stored row (not-a-pick)',
        ),
      ),
    ).toBe(
      'loading Postgres: survival_picks: the domain refuses a stored row (not-a-pick)',
    );
    expect(
      describeProblem(
        'load',
        new Error('match_points production/12/7 is not a database id'),
      ),
    ).toBe('loading Postgres: match_points: an id is not a database id');
  });

  it('is only the class and system code of any other error once the run has fetched', () => {
    const error = Object.assign(new Error('Sentinel-Name-ada is 12'), {
      code: 'ECONNRESET',
    });
    expect(describeProblem('load', error)).toBe(
      'loading Postgres: Error (ECONNRESET)',
    );
    expect(describeProblem('fetch', new TypeError('Sentinel-Name-ada'))).toBe(
      'fetching the backup: TypeError',
    );
  });

  it('gives the first line of an error where no row can be quoted: preflight, a container starting', () => {
    expect(
      describeProblem(
        'preflight',
        new Error('Could not find a working container runtime strategy'),
      ),
    ).toBe(
      'preflight: Error: Could not find a working container runtime strategy',
    );
    expect(
      describeProblem(
        'start-postgres',
        new Error('(HTTP code 409) container stopped/paused'),
      ),
    ).toBe(
      'starting the Postgres container: Error: (HTTP code #) container stopped/paused',
    );
  });

  it('scrubs every quoted value, email and number, and all past the first line', () => {
    const reported = scrubbed(
      'Unknown user \'Sentinel-Name-ada\' (sentinel.ada@example.invalid) "x" 12\nSentinel-Surname-ada',
    );
    expect(reported).toBe('Unknown user ... ... ... #');
  });

  it('summarises a Zod error as the column and the expected type, never the value', () => {
    const error = zodErrorOf(z.array(READ_COLUMNS.users), [
      { id: 1, username: 'ada' },
      { id: 2, username: 404 },
    ]);
    expect(describeProblem('read', error)).toBe(
      'reading the restored MySQL: ZodError: 1 issue; first: username invalid_type (expected string)',
    );
  });

  it("never repeats a refinement's message, which could carry the value", () => {
    const error = zodErrorOf(
      z.object({
        email: z.string().refine(() => false, {
          message: 'sentinel.ada@example.invalid is taken',
        }),
      }),
      { email: 'sentinel.ada@example.invalid' },
    );
    const reported = describeProblem('map', error);
    expect(reported).toBe(
      'mapping the rows: ZodError: 1 issue; first: email custom',
    );
    expect(reported).not.toContain('@');
  });

  it("summarises a failed query as its statement, SQLSTATE and constraint, never its values or the driver's detail", () => {
    const error = new DrizzleQueryError(
      'insert into "players" ("id", "username") values ($1, $2)',
      [12, 'Sentinel-Name-ada'],
      Object.assign(
        new Error('duplicate key value violates unique constraint'),
        {
          code: '23505',
          table: 'players',
          constraint: 'players_username_key',
          detail: 'Key (username)=(Sentinel-Name-ada) already exists.',
        },
      ),
    );
    const reported = describeProblem('load', error);
    expect(reported).toBe(
      'loading Postgres: a query failed: insert into players, SQLSTATE 23505, table players, constraint players_username_key',
    );
    expect(reported).not.toContain('Sentinel');
    expect(reported).not.toContain('12');
  });

  it('is the stage alone for something that is not an Error', () => {
    expect(describeProblem('fetch', 'sentinel.ada@example.invalid')).toBe(
      'fetching the backup: an unknown error',
    );
  });
});
