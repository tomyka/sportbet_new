/** Postgres's SQLSTATE for a unique violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * The unique constraint (or unique index) a statement broke, from pg's
 * error or the one Drizzle wraps in `cause`; null for any other failure.
 * Its message is never read: it quotes the row's values.
 */
export function violatedUnique(error: unknown): string | null {
  for (
    let current: unknown = error;
    current instanceof Error;
    current = current.cause
  ) {
    const code: unknown = Reflect.get(current, 'code');
    const constraint: unknown = Reflect.get(current, 'constraint');
    if (code === UNIQUE_VIOLATION && typeof constraint === 'string') {
      return constraint;
    }
  }
  return null;
}
