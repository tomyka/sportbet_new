import type { SavedRound, TeamRow } from '@sportbet/db';
import {
  instantFrom,
  type Game,
  type Result,
  type RoundNumber,
  type TeamOutcome,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import {
  SPORTBET_TABLES,
  type SportbetRows,
  type SportbetTable,
} from '../read-columns';

// What every section of mapSportbet shares: the ledger that reconciles each
// table, the fates rows take from their parents, and small helpers.

/**
 * A row not loaded, and why. `row` names it without personal data: the
 * sportbet id of a row no player owns (`id 7`), the game, team or event a
 * player's row belongs to (`game 7`), or nothing at all.
 */
interface Refusal {
  readonly reason: string;
  readonly row: string;
}

/** One sportbet table's reconciliation: read = loaded + skipped + refused. */
export interface TableCount {
  readonly table: SportbetTable;
  readonly read: number;
  readonly loaded: number;
  readonly skipped: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
  readonly refusals: readonly Refusal[];
  /**
   * The part of `skipped` and `refused` a row took from its parent
   * (Ledger.follow): skipped with a skipped parent, or refused as an orphan
   * or with a refused parent. The rest the row earned for itself.
   */
  readonly fromParent: {
    readonly skipped: Readonly<Record<string, number>>;
    readonly refused: Readonly<Record<string, number>>;
  };
}

/** What became of a row other rows depend on. */
export type Fate =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

export const LOADED: Fate = Object.freeze({ kind: 'loaded' });

/** A refusal a row inherits from the row it depends on, named once. */
export const dependsOn = (reason: string): string =>
  reason.startsWith('depends-on-refused')
    ? reason
    : `depends-on-refused (${reason})`;

export const refused = (reason: string): Fate => ({ kind: 'refused', reason });
export const skipped = (reason: string): Fate => ({ kind: 'skipped', reason });

interface Count {
  read: number;
  loaded: number;
  skipped: Map<string, number>;
  refused: Map<string, number>;
  refusals: Refusal[];
  fromParent: {
    skipped: Map<string, number>;
    refused: Map<string, number>;
  };
}

const bump = (counts: Map<string, number>, reason: string): void => {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
};

export class Ledger {
  readonly #counts = new Map<SportbetTable, Count>();

  constructor(rows: SportbetRows) {
    for (const table of SPORTBET_TABLES) {
      this.#counts.set(table, {
        read: rows[table].length,
        loaded: 0,
        skipped: new Map(),
        refused: new Map(),
        refusals: [],
        fromParent: { skipped: new Map(), refused: new Map() },
      });
    }
  }

  #of(table: SportbetTable): Count {
    const count = this.#counts.get(table);
    if (count === undefined) throw new ReaderProblem(`map: no table ${table}`);
    return count;
  }

  load(table: SportbetTable): void {
    this.#of(table).loaded += 1;
  }

  skip(table: SportbetTable, reason: string): void {
    bump(this.#of(table).skipped, reason);
  }

  refuse(table: SportbetTable, reason: string, row = ''): void {
    const count = this.#of(table);
    bump(count.refused, reason);
    count.refusals.push({ reason, row });
  }

  /**
   * Follows a row's parent: an unknown parent makes it an orphan, a parent
   * skipped by design skips it for the same reason, and a refused parent
   * refuses it with the reason it inherits. True when the parent is loaded.
   */
  follow(
    table: SportbetTable,
    parent: Fate | undefined,
    row: string,
  ): parent is { readonly kind: 'loaded' } {
    const { fromParent } = this.#of(table);
    if (parent === undefined) {
      this.refuse(table, 'orphan', row);
      bump(fromParent.refused, 'orphan');
      return false;
    }
    switch (parent.kind) {
      case 'loaded':
        return true;
      case 'skipped':
        this.skip(table, parent.reason);
        bump(fromParent.skipped, parent.reason);
        return false;
      case 'refused': {
        const reason = dependsOn(parent.reason);
        this.refuse(table, reason, row);
        bump(fromParent.refused, reason);
        return false;
      }
    }
  }

  tables(): TableCount[] {
    return SPORTBET_TABLES.map((table) => {
      const count = this.#of(table);
      return {
        table,
        read: count.read,
        loaded: count.loaded,
        skipped: Object.fromEntries(count.skipped),
        refused: Object.fromEntries(count.refused),
        refusals: count.refusals,
        fromParent: {
          skipped: Object.fromEntries(count.fromParent.skipped),
          refused: Object.fromEntries(count.fromParent.refused),
        },
      };
    });
  }
}

/** What every section reads and writes: the rows, the ledger, the notices. */
export interface MapContext {
  readonly rows: SportbetRows;
  readonly ledger: Ledger;
  readonly notices: string[];
}

/** An id the domain always accepts for a positive sportbet id. */
export function must<T, R extends string>(
  result: Result<T, R>,
  what: string,
): T {
  if (!result.ok) throw new ReaderProblem(`map: ${what}: ${result.refusal}`);
  return result.value;
}

/** sportbet's `game_date` (UTC, `YYYY-MM-DD HH:MM:SS`) as an instant. */
export const tipOffOf = (gameDate: string): ReturnType<typeof instantFrom> =>
  instantFrom(`${gameDate.replace(' ', 'T')}Z`);

export interface RoundRow {
  readonly tournament: number;
  readonly number: RoundNumber;
  readonly saved: SavedRound;
}
export interface TeamEntry {
  readonly tournament: number;
  readonly row: TeamRow;
  readonly outcome: TeamOutcome;
}
export interface GameEntry {
  readonly tournament: number;
  readonly game: Game;
}

/** Rows grouped per loaded tournament, as they are mapped. */
export class PerTournament<T> {
  readonly #rows = new Map<number, T[]>();

  add(tournament: number, row: T): void {
    this.#rows.set(tournament, [...(this.#rows.get(tournament) ?? []), row]);
  }

  of(tournament: number): readonly T[] {
    return this.#rows.get(tournament) ?? [];
  }
}

/** A player's row key: the user and the game or team it belongs to. */
export const playerKey = (user: number, of: number): string =>
  `${String(user)}/${String(of)}`;

/** How many of `rows` share each key. */
export function copiesByKey<R>(
  rows: readonly R[],
  keyOf: (row: R) => string,
): Map<string, number> {
  const copies = new Map<string, number>();
  for (const row of rows) bump(copies, keyOf(row));
  return copies;
}

/** A parent's fate as its dependants see it: skipped stays skipped, refused is inherited. */
export function inherit(parent: Fate): Fate {
  switch (parent.kind) {
    case 'loaded':
      return LOADED;
    case 'skipped':
      return parent;
    case 'refused':
      return refused(dependsOn(parent.reason));
  }
}

/**
 * The first parent that keeps a row from loading: an unknown one (an
 * orphan) first, then one skipped or refused. Null when all are loaded.
 */
export function firstBlocked(
  parents: readonly (Fate | undefined)[],
): { readonly fate: Fate | undefined } | null {
  if (parents.includes(undefined)) return { fate: undefined };
  const blocked = parents.find(
    (parent) => parent !== undefined && parent.kind !== 'loaded',
  );
  return blocked === undefined ? null : { fate: blocked };
}

/**
 * The keys in `found` (null: a row whose parents did not load) that no
 * loaded row has, each once, in the order found.
 */
export function unloaded<K>(
  found: readonly (K | null)[],
  loaded: readonly K[],
  keyOf: (key: K) => string,
): K[] {
  const done = new Set(loaded.map(keyOf));
  const out = new Map<string, K>();
  for (const key of found) {
    if (key !== null && !done.has(keyOf(key))) out.set(keyOf(key), key);
  }
  return [...out.values()];
}
