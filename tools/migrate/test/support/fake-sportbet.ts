import {
  columnsOf,
  expectedNullable,
  expectedType,
  SPORTBET_TABLES,
  type SportbetTable,
} from '../../src/read-columns';
import type { Dump } from '../fixtures/sportbet-dump';

const tableOf = (sql: string): SportbetTable => {
  const table = /from `([a-z_]+)`/.exec(sql)?.[1];
  const known = SPORTBET_TABLES.find((each) => each === table);
  if (known === undefined) throw new Error(`no table in: ${sql}`);
  return known;
};

/** The two calls the reader makes on its MySQL connection. */
export interface FakeConnection {
  readonly query: (sql: string) => Promise<[unknown[], unknown[]]>;
  readonly end: () => Promise<void>;
}

/**
 * A restored copy of `dump` as the reader's three queries see it - the
 * schema, each table's count and its read columns - with no MySQL behind
 * it. `missing` (`table.column`) leaves columns out of the schema.
 */
export function fakeSportbet(
  dump: Dump,
  { missing = [] }: { readonly missing?: readonly string[] } = {},
): FakeConnection {
  const answer = (sql: string): unknown[] => {
    if (sql.includes('information_schema')) {
      return SPORTBET_TABLES.flatMap((table) =>
        columnsOf(table)
          .filter((column) => !missing.includes(`${table}.${column}`))
          .map((column) => ({
            table,
            column,
            type: expectedType(table, column),
            nullable: expectedNullable(table, column) ? 'YES' : 'NO',
          })),
      );
    }
    const table = tableOf(sql);
    if (sql.startsWith('select count(*)')) {
      return [{ rows: dump[table].length }];
    }
    return dump[table].map((row) =>
      Object.fromEntries(
        columnsOf(table).map((column) => [column, row[column] ?? null]),
      ),
    );
  };
  return {
    query: (sql: string) => Promise.resolve([answer(sql), []]),
    end: () => Promise.resolve(),
  };
}
