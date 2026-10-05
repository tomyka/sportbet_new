const SQLSTATE = /^[0-9A-Z]{5}$/;

/** Postgres's SQLSTATE on `error` or on the errors it wraps (Drizzle puts pg's in `cause`). */
function sqlState(error: Error): string | null {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    const code: unknown = Reflect.get(current, 'code');
    if (typeof code === 'string' && SQLSTATE.test(code)) return code;
  }
  return null;
}

/**
 * What a failure is, for a log line: the error's name and, from Postgres,
 * its SQLSTATE. Never its message: Drizzle's quotes the query's
 * parameters, and Postgres's detail quotes row values, either of which
 * can be an address (CLAUDE.md, plan > Nothing personal in any log).
 */
export function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const state = sqlState(error);
  return state === null ? error.name : `${error.name}, SQLSTATE ${state}`;
}
