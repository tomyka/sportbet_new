import { z } from 'zod';

/**
 * A reason the run stopped that the reader wrote itself, from parts that
 * name no row value and no player: a dump refusal, the mysql client's exit
 * code, a drifted column, an interrupt. Its message is reported as is.
 */
export class ReaderProblem extends Error {
  override readonly name = 'ReaderProblem';
}

/** Where in the run an error happened: the start of every reported problem. */
export type Stage =
  | 'preflight'
  | 'fetch'
  | 'check'
  | 'start-mysql'
  | 'restore'
  | 'schema'
  | 'read'
  | 'old-app'
  | 'read-old-app'
  | 'map'
  | 'start-postgres'
  | 'load'
  | 'reconcile'
  | 'recalculate'
  | 'parity'
  | 'cleanup';

const STAGE_TEXT: Readonly<Record<Stage, string>> = {
  preflight: 'preflight',
  fetch: 'fetching the backup',
  check: 'checking the dump',
  'start-mysql': 'starting the MySQL container',
  restore: 'restoring the dump into MySQL',
  schema: "checking sportbet's schema",
  read: 'reading the restored MySQL',
  'old-app': "running sportbet's own recalculation",
  'read-old-app': "reading sportbet's recalculated rows",
  map: 'mapping the rows',
  'start-postgres': 'starting the Postgres container',
  load: 'loading Postgres',
  reconcile: 'reconciling the load',
  recalculate: 'recalculating',
  parity: 'checking parity',
  cleanup: 'cleanup',
};

/**
 * An error's text with everything that could be a row value taken out:
 * only its first line, up to any `params:` or `detail` (where drivers
 * quote values), with every quoted string and every number replaced. What
 * is left names tables, columns and what went wrong - never an id, a
 * username, an email or a name.
 */
export function scrubbed(text: string): string {
  const line = text.split('\n')[0] ?? '';
  const cut = /\b(params|detail|key)\s*[:(]/i.exec(line);
  return (cut === null ? line : line.slice(0, cut.index))
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '...')
    .replace(/\S*@\S*/g, '...')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

const zodIssue = z
  .object({
    code: z.string(),
    path: z.array(z.union([z.string(), z.number(), z.symbol()])),
    expected: z.string().optional(),
  })
  .loose();

/**
 * A Zod error as its issue count and first issue: the code, the column path
 * (row positions dropped) and the type expected - never the value received
 * or Zod's message, which a refinement could fill with the value.
 */
export function issuesSummary(issues: readonly unknown[]): string {
  const first = zodIssue.safeParse(issues[0]);
  const count = `${String(issues.length)} issue${issues.length === 1 ? '' : 's'}`;
  if (!first.success) return `ZodError: ${count}`;
  const path = first.data.path
    .filter((part) => typeof part === 'string')
    .join('.');
  const expected =
    first.data.expected === undefined
      ? ''
      : ` (expected ${scrubbed(first.data.expected)})`;
  return `ZodError: ${count}; first: ${path === '' ? '(root)' : path} ${first.data.code}${expected}`;
}

const driverError = z
  .object({
    code: z.string().optional(),
    table: z.string().optional(),
    column: z.string().optional(),
    constraint: z.string().optional(),
  })
  .loose();

/** The SQL verb and table of a statement, e.g. `insert into players`. */
function statementOf(query: string): string {
  const found =
    /^\s*(insert into|update|delete from|select\b[\s\S]*?\bfrom)\s+"?([a-z_][a-z0-9_]*)"?/i.exec(
      query,
    );
  if (found === null) return 'a statement';
  const verb = (found[1] ?? '').toLowerCase().startsWith('select')
    ? 'select from'
    : (found[1] ?? '').toLowerCase();
  return `${verb} ${found[2] ?? ''}`;
}

/**
 * A failed query (Drizzle's DrizzleQueryError, which carries the statement,
 * its parameters and the driver's error) as the statement's verb and table
 * and the driver's SQLSTATE, table, column and constraint - never the
 * parameters or the driver's message and detail, which quote row values.
 */
function querySummary(error: Error & { query: string }): string {
  const cause = driverError.safeParse(
    'cause' in error ? error.cause : undefined,
  );
  const parts = [`a query failed: ${statementOf(error.query)}`];
  if (cause.success) {
    const { code, table, column, constraint } = cause.data;
    if (code !== undefined && /^[0-9A-Z]{5}$/.test(code)) {
      parts.push(`SQLSTATE ${code}`);
    }
    if (table !== undefined) parts.push(`table ${table}`);
    if (column !== undefined) parts.push(`column ${column}`);
    if (constraint !== undefined) parts.push(`constraint ${constraint}`);
  }
  return parts.join(', ');
}

const hasQuery = (error: Error): error is Error & { query: string } =>
  'query' in error && typeof error.query === 'string';

const hasIssues = (error: Error): error is Error & { issues: unknown[] } =>
  'issues' in error && Array.isArray(error.issues);

/**
 * The repositories' own messages about a stored row (packages/db edge.ts),
 * as their table and refusal, the row's key dropped: it can be a player's
 * id (`survival_picks 12`, `match_points production/12/7`).
 */
const REPOSITORY_MESSAGES: readonly (readonly [
  RegExp,
  (found: RegExpExecArray) => string,
])[] = [
  [
    /^([a-z_]+) \S+: the domain refuses the stored row \(([a-z0-9-]+)\)$/,
    (found) =>
      `${found[1] ?? ''}: the domain refuses a stored row (${found[2] ?? ''})`,
  ],
  [
    /^([a-z_]+) \S+ is not a database id$/,
    (found) => `${found[1] ?? ''}: an id is not a database id`,
  ],
];

/** A Node system error's code (ENOENT, EBUSY, ECONNREFUSED). */
const systemCode = (error: Error): string | null => {
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' && /^E[A-Z0-9_]+$/.test(code) ? code : null;
};

/**
 * The stages whose errors cannot quote a row: before anything is fetched,
 * and a container starting (Docker's and Testcontainers' own messages).
 */
const BEFORE_ANY_ROW: ReadonlySet<Stage> = new Set([
  'preflight',
  'start-mysql',
  'start-postgres',
]);

/**
 * What the report says about an error at `stage`: the stage, then the
 * reader's own problem as it wrote it, a Zod or query error summarised, a
 * repository's stored-row message without its key, or else the error's
 * class and system code only. Only where no row can be quoted - in
 * preflight and while a container starts (BEFORE_ANY_ROW) - is another
 * error's first line given, scrubbed. Never a row value, a username, an
 * email or a player id.
 */
export function describeProblem(stage: Stage, error: unknown): string {
  const where = STAGE_TEXT[stage];
  if (!(error instanceof Error)) return `${where}: an unknown error`;
  const known = knownProblem(error);
  if (known !== null) return `${where}: ${known}`;
  const name = /^[A-Za-z]+$/.test(error.name) ? error.name : 'Error';
  const code = systemCode(error);
  const kind = code === null ? name : `${name} (${code})`;
  if (!BEFORE_ANY_ROW.has(stage)) return `${where}: ${kind}`;
  const text = scrubbed(error.message);
  return `${where}: ${kind}${text === '' ? '' : `: ${text}`}`;
}

/**
 * An error the reader can describe without quoting a row: its own problem
 * as written, a Zod or query error summarised, a repository's stored-row
 * message without its key. Null for any other.
 */
function knownProblem(error: Error): string | null {
  if (error instanceof ReaderProblem) return error.message;
  if (hasIssues(error)) return issuesSummary(error.issues);
  if (hasQuery(error)) return querySummary(error);
  for (const [pattern, text] of REPOSITORY_MESSAGES) {
    const found = pattern.exec(error.message);
    if (found !== null) return text(found);
  }
  return null;
}
