// The synthetic dump's format: the rows of each table, and the text
// DatabaseDumpWriter writes for them (header, per table DROP and CREATE,
// extended INSERTs a tuple a line, the completion marker), and the rows the
// reader reads back from it.

import { READ_COLUMNS, type SportbetRows } from '../../src/read-columns';
import { CREATE_TABLE, type DumpTable } from './create-tables';

type SqlValue = string | number | null;
export type DumpRow = Readonly<Record<string, SqlValue>>;
export type Dump = Readonly<Record<DumpTable, readonly DumpRow[]>>;

const DUMP_TABLES = Object.keys(CREATE_TABLE).filter(
  (table): table is DumpTable => table in CREATE_TABLE,
);

/** A table's columns, in its CREATE TABLE order. */
function columnsIn(table: DumpTable): string[] {
  return CREATE_TABLE[table]
    .split('\n')
    .flatMap((line) => /^ {2}`([a-z0-9_]+)` /.exec(line)?.[1] ?? []);
}

/** Columns sportbet stores as `double`: PHP writes them unquoted. */
const doubles = new Set(
  columnsIn('point_standings').filter(
    (column) => column.endsWith('_points') || column.endsWith('_odds'),
  ),
);

/** What PDO::quote (MySQL) puts before each character it escapes. */
const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\0': '\\0',
};

/** A value as PDO::quote (MySQL) and MySqlDumpDialect::quoteValue write it. */
function quote(column: string, value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number' || doubles.has(column)) return String(value);
  const escaped = value.replace(
    /[\\'"\n\r\0]/g,
    (character) => ESCAPES[character] ?? character,
  );
  return `'${escaped}'`;
}

/**
 * The dump's text, as DatabaseDumpWriter writes it: tables sorted by name,
 * each dropped and created, then its rows. `engine` is the header's engine
 * line; `complete` false leaves the completion marker off.
 */
export function renderDump(
  dump: Dump,
  { engine = 'mysql 26.7.0', complete = true } = {},
): string {
  const tables = [...DUMP_TABLES].sort();
  const header = [
    '-- SportBet database dump',
    '--',
    '-- generated_at : 2026-09-29T02:17:08Z',
    `-- engine       : ${engine}`,
    '-- tag          : daily',
    `-- tables       : ${String(tables.length)}`,
    '-- no rows for  : (none)',
    '-- nulled       : users.remember_token',
    '--',
    '-- A synthetic dump for the production-copy reader tests: no real player.',
    '',
    '',
  ].join('\n');
  const preamble = [
    'SET NAMES utf8mb4',
    "SET time_zone = '+00:00'",
    'SET FOREIGN_KEY_CHECKS = 0',
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'",
    'SET UNIQUE_CHECKS = 0',
  ]
    .map((statement) => `${statement};\n`)
    .join('');
  let rows = 0;
  let body = '';
  for (const table of tables) {
    body += `\n--\n-- ${table}\n--\n`;
    body += `DROP TABLE IF EXISTS \`${table}\`;\n${CREATE_TABLE[table]};\n`;
    const columns = columnsIn(table);
    const tuples = dump[table].map(
      (row) =>
        `(${columns.map((column) => quote(column, row[column] ?? null)).join(',')})`,
    );
    rows += tuples.length;
    if (tuples.length > 0) {
      body += `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES\n${tuples.join(',\n')};\n`;
    }
  }
  const postamble = 'SET UNIQUE_CHECKS = 1;\nSET FOREIGN_KEY_CHECKS = 1;\n';
  const footer = `\n--\n-- rows written : ${String(rows)}\n${complete ? '-- SPORTBET DUMP COMPLETE\n' : ''}`;
  return header + preamble + body + postamble + footer;
}

/**
 * The rows the reader reads from a restored copy of `dump`, as mysql2 hands
 * them over (READ_COLUMNS parses each and drops every column not read).
 */
export function readRows(dump: Dump): SportbetRows {
  // A column the fixture leaves out is NULL in the restored table.
  const all = (table: DumpTable) =>
    dump[table].map((row) =>
      Object.fromEntries(
        columnsIn(table).map((column) => [column, row[column] ?? null]),
      ),
    );
  return {
    tournaments: all('tournaments').map((row) =>
      READ_COLUMNS.tournaments.parse(row),
    ),
    events: all('events').map((row) => READ_COLUMNS.events.parse(row)),
    teams: all('teams').map((row) => READ_COLUMNS.teams.parse(row)),
    games: all('games').map((row) => READ_COLUMNS.games.parse(row)),
    game_odds: all('game_odds').map((row) => READ_COLUMNS.game_odds.parse(row)),
    users: all('users').map((row) => READ_COLUMNS.users.parse(row)),
    user_settings: all('user_settings').map((row) =>
      READ_COLUMNS.user_settings.parse(row),
    ),
    leagues: all('leagues').map((row) => READ_COLUMNS.leagues.parse(row)),
    league_members: all('league_members').map((row) =>
      READ_COLUMNS.league_members.parse(row),
    ),
    prediction_results: all('prediction_results').map((row) =>
      READ_COLUMNS.prediction_results.parse(row),
    ),
    prediction_standings: all('prediction_standings').map((row) =>
      READ_COLUMNS.prediction_standings.parse(row),
    ),
    prediction_survivals: all('prediction_survivals').map((row) =>
      READ_COLUMNS.prediction_survivals.parse(row),
    ),
    point_results: all('point_results').map((row) =>
      READ_COLUMNS.point_results.parse(row),
    ),
    point_standings: all('point_standings').map((row) =>
      READ_COLUMNS.point_standings.parse(row),
    ),
    point_survivals: all('point_survivals').map((row) =>
      READ_COLUMNS.point_survivals.parse(row),
    ),
  };
}
