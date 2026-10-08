import mysql, { type Connection, type ConnectionOptions } from 'mysql2/promise';
import { z } from 'zod';
import { issuesSummary, ReaderProblem } from './problem';
import {
  columnsOf,
  expectedNullable,
  expectedType,
  ORDER_BY,
  READ_COLUMNS,
  SPORTBET_TABLES,
  type SportbetRow,
  type SportbetRows,
  type SportbetTable,
} from './read-columns';

/**
 * A connection that hands every value over as READ_COLUMNS parses it:
 * DATE and DATETIME as text (dateStrings), a `double` as the shortest text
 * that reads back as it, and a BLOB (`generated`) as its bytes read one
 * character each, so an unexpected byte is kept and refused, not guessed.
 */
export function openSportbet(options: ConnectionOptions): Promise<Connection> {
  return mysql.createConnection({
    ...options,
    dateStrings: true,
    typeCast: (field, next) => {
      if (field.type === 'DOUBLE') return field.string();
      if (field.type === 'BLOB')
        return field.buffer()?.toString('latin1') ?? null;
      return next();
    },
  });
}

const quoted = (name: string) => `\`${name.replaceAll('`', '``')}\``;

const described = z.array(
  z.object({
    table: z.string(),
    column: z.string(),
    type: z.string(),
    nullable: z.enum(['YES', 'NO']),
  }),
);

/** A column of the restored database, as information_schema describes it. */
export interface FoundColumn {
  readonly type: string;
  readonly nullable: boolean;
}

const nullability = (nullable: boolean) => (nullable ? 'nullable' : 'not null');

/**
 * Every read column the restored database lacks, or holds with another
 * type or nullability than sportbet's migrations at 3eb95e7 give it, as
 * `table.column: why`, from the columns found (`table.column` to its
 * column_type and nullability). A column sportbet added later is not the
 * reader's concern.
 */
export function driftOf(found: ReadonlyMap<string, FoundColumn>): string[] {
  return SPORTBET_TABLES.flatMap((table) =>
    columnsOf(table).flatMap((column) => {
      const name = `${table}.${column}`;
      const actual = found.get(name);
      if (actual === undefined) return [`${name}: missing`];
      const type = expectedType(table, column);
      if (actual.type !== type) {
        return [`${name}: expected ${type}, found ${actual.type}`];
      }
      const nullable = expectedNullable(table, column);
      return actual.nullable === nullable
        ? []
        : [
            `${name}: expected ${nullability(nullable)}, found ${nullability(actual.nullable)}`,
          ];
    }),
  );
}

/** The schema drift of the restored database (driftOf). */
export async function schemaDrift(connection: Connection): Promise<string[]> {
  const [rows] = await connection.query(
    `select table_name as \`table\`, column_name as \`column\`, column_type as \`type\`,
       is_nullable as \`nullable\`
     from information_schema.columns where table_schema = database()`,
  );
  return driftOf(
    new Map(
      described
        .parse(rows)
        .map(({ table, column, type, nullable }) => [
          `${table}.${column}`,
          { type, nullable: nullable === 'YES' },
        ]),
    ),
  );
}

/**
 * A table's rows parsed by its schema; a row that does not parse stops the
 * run, reported as the table and the Zod summary (issuesSummary), never
 * the value.
 */
function parsed<T extends SportbetTable>(
  table: T,
  rows: unknown[],
): SportbetRow<T>[] {
  const result = z.array(READ_COLUMNS[table]).safeParse(rows);
  if (!result.success) {
    throw new ReaderProblem(`${table}: ${issuesSummary(result.error.issues)}`);
  }
  return result.data;
}

/** Table `table`'s rows, READ_COLUMNS only, in key order, each parsed. */
async function readTable<T extends SportbetTable>(
  connection: Connection,
  table: T,
): Promise<SportbetRow<T>[]> {
  const [rows] = await connection.query(
    `select ${columnsOf(table).map(quoted).join(', ')} from ${quoted(table)} order by ${ORDER_BY[table]}`,
  );
  return parsed(table, z.array(z.unknown()).parse(rows));
}

/** How many rows each table holds in the dump. */
async function countRows(
  connection: Connection,
): Promise<Map<SportbetTable, number>> {
  const inDump = new Map<SportbetTable, number>();
  for (const table of SPORTBET_TABLES) {
    const [counted] = await connection.query(
      `select count(*) as \`rows\` from ${quoted(table)}`,
    );
    const [only] = z.array(z.object({ rows: z.int() })).parse(counted);
    inDump.set(table, only?.rows ?? 0);
  }
  return inDump;
}

/** Every table's rows, READ_COLUMNS only, in key order; and each table's row count. */
export async function readSportbet(connection: Connection): Promise<{
  readonly rows: SportbetRows;
  readonly inDump: ReadonlyMap<SportbetTable, number>;
}> {
  const inDump = await countRows(connection);
  const read = <T extends SportbetTable>(table: T) =>
    readTable(connection, table);
  return {
    rows: {
      tournaments: await read('tournaments'),
      events: await read('events'),
      teams: await read('teams'),
      games: await read('games'),
      game_odds: await read('game_odds'),
      users: await read('users'),
      user_settings: await read('user_settings'),
      leagues: await read('leagues'),
      league_members: await read('league_members'),
      prediction_results: await read('prediction_results'),
      prediction_standings: await read('prediction_standings'),
      prediction_survivals: await read('prediction_survivals'),
      point_results: await read('point_results'),
      point_standings: await read('point_standings'),
      point_survivals: await read('point_survivals'),
    },
    inDump,
  };
}
