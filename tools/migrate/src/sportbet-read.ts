import mysql, { type Connection, type ConnectionOptions } from 'mysql2/promise';
import { z } from 'zod';
import {
  columnsOf,
  expectedType,
  ORDER_BY,
  READ_COLUMNS,
  SPORTBET_TABLES,
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
  z.object({ table: z.string(), column: z.string(), type: z.string() }),
);

/**
 * Every read column the restored database lacks, or holds with another
 * type than sportbet's migrations at 0da316f give it, as `table.column:
 * why`, from the columns found (`table.column` to its column_type). A
 * column sportbet added later is not the reader's concern.
 */
export function driftOf(found: ReadonlyMap<string, string>): string[] {
  return SPORTBET_TABLES.flatMap((table) =>
    columnsOf(table).flatMap((column) => {
      const expected = expectedType(table, column);
      const actual = found.get(`${table}.${column}`);
      if (actual === undefined) return [`${table}.${column}: missing`];
      return actual === expected
        ? []
        : [`${table}.${column}: expected ${expected}, found ${actual}`];
    }),
  );
}

/** The schema drift of the restored database (driftOf). */
export async function schemaDrift(connection: Connection): Promise<string[]> {
  const [rows] = await connection.query(
    `select table_name as \`table\`, column_name as \`column\`, column_type as \`type\`
     from information_schema.columns where table_schema = database()`,
  );
  return driftOf(
    new Map(
      described
        .parse(rows)
        .map(({ table, column, type }) => [`${table}.${column}`, type]),
    ),
  );
}

/** Every table's rows, READ_COLUMNS only, in key order; and each table's row count. */
export async function readSportbet(connection: Connection): Promise<{
  readonly rows: SportbetRows;
  readonly inDump: ReadonlyMap<SportbetTable, number>;
}> {
  const select = async (table: SportbetTable): Promise<unknown[]> => {
    const [rows] = await connection.query(
      `select ${columnsOf(table).map(quoted).join(', ')} from ${quoted(table)} order by ${ORDER_BY[table]}`,
    );
    return z.array(z.unknown()).parse(rows);
  };
  const inDump = new Map<SportbetTable, number>();
  for (const table of SPORTBET_TABLES) {
    const [counted] = await connection.query(
      `select count(*) as \`rows\` from ${quoted(table)}`,
    );
    const [only] = z.array(z.object({ rows: z.int() })).parse(counted);
    inDump.set(table, only?.rows ?? 0);
  }
  return {
    rows: {
      tournaments: z
        .array(READ_COLUMNS.tournaments)
        .parse(await select('tournaments')),
      events: z.array(READ_COLUMNS.events).parse(await select('events')),
      teams: z.array(READ_COLUMNS.teams).parse(await select('teams')),
      games: z.array(READ_COLUMNS.games).parse(await select('games')),
      game_odds: z
        .array(READ_COLUMNS.game_odds)
        .parse(await select('game_odds')),
      users: z.array(READ_COLUMNS.users).parse(await select('users')),
      user_settings: z
        .array(READ_COLUMNS.user_settings)
        .parse(await select('user_settings')),
      leagues: z.array(READ_COLUMNS.leagues).parse(await select('leagues')),
      league_members: z
        .array(READ_COLUMNS.league_members)
        .parse(await select('league_members')),
      prediction_results: z
        .array(READ_COLUMNS.prediction_results)
        .parse(await select('prediction_results')),
      prediction_standings: z
        .array(READ_COLUMNS.prediction_standings)
        .parse(await select('prediction_standings')),
      prediction_survivals: z
        .array(READ_COLUMNS.prediction_survivals)
        .parse(await select('prediction_survivals')),
      point_results: z
        .array(READ_COLUMNS.point_results)
        .parse(await select('point_results')),
      point_standings: z
        .array(READ_COLUMNS.point_standings)
        .parse(await select('point_standings')),
      point_survivals: z
        .array(READ_COLUMNS.point_survivals)
        .parse(await select('point_survivals')),
    },
    inDump,
  };
}
