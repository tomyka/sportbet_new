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
function parsed<S extends z.ZodType>(
  table: SportbetTable,
  schema: S,
  rows: unknown[],
): z.infer<S>[] {
  const result = z.array(schema).safeParse(rows);
  if (!result.success) {
    throw new ReaderProblem(`${table}: ${issuesSummary(result.error.issues)}`);
  }
  return result.data;
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
      tournaments: parsed(
        'tournaments',
        READ_COLUMNS.tournaments,
        await select('tournaments'),
      ),
      events: parsed('events', READ_COLUMNS.events, await select('events')),
      teams: parsed('teams', READ_COLUMNS.teams, await select('teams')),
      games: parsed('games', READ_COLUMNS.games, await select('games')),
      game_odds: parsed(
        'game_odds',
        READ_COLUMNS.game_odds,
        await select('game_odds'),
      ),
      users: parsed('users', READ_COLUMNS.users, await select('users')),
      user_settings: parsed(
        'user_settings',
        READ_COLUMNS.user_settings,
        await select('user_settings'),
      ),
      leagues: parsed('leagues', READ_COLUMNS.leagues, await select('leagues')),
      league_members: parsed(
        'league_members',
        READ_COLUMNS.league_members,
        await select('league_members'),
      ),
      prediction_results: parsed(
        'prediction_results',
        READ_COLUMNS.prediction_results,
        await select('prediction_results'),
      ),
      prediction_standings: parsed(
        'prediction_standings',
        READ_COLUMNS.prediction_standings,
        await select('prediction_standings'),
      ),
      prediction_survivals: parsed(
        'prediction_survivals',
        READ_COLUMNS.prediction_survivals,
        await select('prediction_survivals'),
      ),
      point_results: parsed(
        'point_results',
        READ_COLUMNS.point_results,
        await select('point_results'),
      ),
      point_standings: parsed(
        'point_standings',
        READ_COLUMNS.point_standings,
        await select('point_standings'),
      ),
      point_survivals: parsed(
        'point_survivals',
        READ_COLUMNS.point_survivals,
        await select('point_survivals'),
      ),
    },
    inDump,
  };
}
