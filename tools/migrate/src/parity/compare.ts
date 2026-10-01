import type {
  GameId,
  PlayerId,
  PointsRows,
  RoundNumber,
  StandingsLine,
  SurvivalPoints,
  TeamId,
} from '@sportbet/domain';
import type { RefusedPoints } from '../map';

/** The tables the checker compares; `game_odds` last, as it explains the others. */
export const PARITY_TABLES = [
  'point_results',
  'point_standings',
  'point_survivals',
  'game_odds',
] as const;
export type ParityTable = (typeof PARITY_TABLES)[number];

/** Spec 1: the class each row key gets. */
export const PARITY_CLASSES = [
  'match',
  'stale',
  'new-code-wrong',
  'refused',
] as const;
export type ParityClass = (typeof PARITY_CLASSES)[number];

/** What a row is about, so the report can name it. */
export type RowSubject =
  | {
      readonly table: 'point_results';
      readonly player: PlayerId;
      readonly game: GameId;
    }
  | {
      readonly table: 'point_standings';
      readonly player: PlayerId;
      readonly team: TeamId;
    }
  | {
      readonly table: 'point_survivals';
      readonly player: PlayerId;
      readonly round: RoundNumber;
      /**
       * sportbet's `point_survivals.id` (two rows may share a player and a
       * round); null for a row folded from the picks (rulings.ts).
       */
      readonly storedId: number | null;
    }
  | { readonly table: 'game_odds'; readonly game: GameId };

/**
 * One column that differs, with its value on each side: the exact decimal
 * text sportbet stores (two places for points and odds, four for
 * standings), `null`, or - for the column `row` - `present` or `no row`.
 */
export interface ColumnDifference {
  readonly column: string;
  readonly production: string;
  readonly oldApp: string;
  readonly newCode: string;
}

export interface ClassifiedRow {
  readonly subject: RowSubject;
  readonly class: ParityClass;
  /**
   * `new-code-wrong`: the columns where the new code and the old app
   * differ; `stale`: where the new code and production differ; else none.
   */
  readonly differences: readonly ColumnDifference[];
}

export interface TableParity {
  readonly table: ParityTable;
  readonly counts: Readonly<Record<ParityClass, number>>;
  /** Every row that is not a `match`, in key order. */
  readonly rows: readonly ClassifiedRow[];
}

/** One tournament's three sets of rows, and what the reader refused. */
export interface ParitySides {
  /** Oracle (a): production's rows as dumped. */
  readonly production: PointsRows;
  /** Oracle (b): the same copy after sportbet's own full recalculation. */
  readonly oldApp: PointsRows;
  /** The new code under sportbetRules, as the reader stored it. */
  readonly newCode: PointsRows;
  /** The rows the reader could not compare, from both oracles' maps. */
  readonly refused: RefusedPoints;
  /**
   * The tournament's games with a result: only their odds are compared, as
   * sportbet inserts a blank odds row with every game and only a scored
   * game is scored (CO-7).
   */
  readonly scored: ReadonlySet<GameId>;
}

/** One row of one side: what it is about, and each column's exact text. */
export interface KeyedRow {
  readonly subject: RowSubject;
  readonly cells: Readonly<Record<string, string>>;
}

/** How a side's survival rows are keyed. */
export type SurvivalKey = (row: SurvivalPoints) => string;

/**
 * By the stored row each rewrites (sportbet's id): every row refolded
 * under sportbetRules has one, and sportbet's refold updates rows in place.
 */
const byStoredRow: SurvivalKey = (row) => {
  if (row.storedId === null) {
    throw new Error('compare: a survival row rewrites no stored row');
  }
  return String(row.storedId);
};

const line = (name: string, value: StandingsLine) => ({
  [`${name}_points`]: value.points?.toString() ?? 'null',
  [`${name}_odds`]: value.odds?.toString() ?? 'null',
});

/**
 * One table of one side, by key, each row as its columns' exact text: the
 * odds of `scored` games only, survival rows keyed by `survivalKey`.
 */
export function keyedRows(
  rows: PointsRows,
  table: ParityTable,
  scored: ReadonlySet<GameId>,
  survivalKey: SurvivalKey = byStoredRow,
): ReadonlyMap<string, KeyedRow> {
  const out = new Map<string, KeyedRow>();
  const put = (key: string, entry: KeyedRow) => {
    if (out.has(key)) {
      // Every side comes through the map, which refuses a duplicate key.
      throw new Error(`compare: ${table} ${key} twice on one side`);
    }
    out.set(key, entry);
  };
  switch (table) {
    case 'point_results':
      for (const { player, game, points, serija } of rows.matches) {
        put(`${player}/${String(game)}`, {
          subject: { table, player, game },
          cells: {
            winner_points: points.winner.toString(),
            difference_points: points.margin.toString(),
            bingo_points: points.bingo.toString(),
            odds: points.odds.toString(),
            odds_points: points.oddsPoints.toString(),
            full_points: points.full.toString(),
            streak_bonus: serija.toString(),
          },
        });
      }
      break;
    case 'point_standings':
      for (const row of rows.standings) {
        put(`${row.player}/${row.team}`, {
          subject: { table, player: row.player, team: row.team },
          cells: {
            ...line('group_position', row.place),
            ...line('quarterfinal', row.playOffs),
            ...line('semifinal', row.finalFour),
            ...line('final', row.final),
          },
        });
      }
      break;
    case 'point_survivals':
      for (const row of rows.survival) {
        put(survivalKey(row), {
          subject: {
            table,
            player: row.player,
            round: row.round,
            storedId: row.storedId,
          },
          cells: {
            survival_points: row.points?.toString() ?? 'null',
            team_id: row.team,
          },
        });
      }
      break;
    case 'game_odds':
      for (const { game, odds } of rows.odds) {
        if (!scored.has(game)) continue;
        put(String(game), {
          subject: { table, game },
          cells: {
            home_odds: odds.home.toString(),
            away_odds: odds.away.toString(),
            draw_odds: odds.draw.toString(),
          },
        });
      }
      break;
  }
  return out;
}

/** The columns where two sides' rows differ: `row` when only one has it. */
export function differing(
  a: KeyedRow | undefined,
  b: KeyedRow | undefined,
): string[] {
  if (a === undefined && b === undefined) return [];
  if (a === undefined || b === undefined) return ['row'];
  return Object.keys(a.cells).filter(
    (column) => a.cells[column] !== b.cells[column],
  );
}

/** The keys of `table` the reader refused, or whose inputs it refused. */
function refusedKeys(
  refused: RefusedPoints,
  table: ParityTable,
): ReadonlySet<string> {
  switch (table) {
    case 'point_results':
      return new Set(
        refused.matches.map(({ player, game }) => `${player}/${String(game)}`),
      );
    case 'point_standings':
      return new Set(
        refused.standings.map(({ player, team }) => `${player}/${team}`),
      );
    case 'point_survivals':
      return new Set(refused.survival.map(String));
    case 'game_odds':
      return new Set(refused.odds.map(String));
  }
}

const valueOf = (side: KeyedRow | undefined, column: string): string => {
  if (column === 'row') return side === undefined ? 'no row' : 'present';
  return side?.cells[column] ?? 'no row';
};

function compareTable(sides: ParitySides, table: ParityTable): TableParity {
  const production = keyedRows(sides.production, table, sides.scored);
  const oldApp = keyedRows(sides.oldApp, table, sides.scored);
  const newCode = keyedRows(sides.newCode, table, sides.scored);
  const refused = refusedKeys(sides.refused, table);
  // A game whose odds were refused is scored at CO-5's 1.0 by the new code
  // and at one of its rows by sportbet: none of its match rows compares.
  const oddsRefused = new Set(sides.refused.odds);
  const counts: Record<ParityClass, number> = {
    match: 0,
    stale: 0,
    'new-code-wrong': 0,
    refused: 0,
  };
  const rows: ClassifiedRow[] = [];
  const keys = [
    ...new Set([...production.keys(), ...oldApp.keys(), ...newCode.keys()]),
  ].sort();
  for (const key of keys) {
    const a = production.get(key);
    const b = oldApp.get(key);
    const n = newCode.get(key);
    const subject = (n ?? b ?? a)?.subject;
    if (subject === undefined) throw new Error('compare: a key with no row');
    const isRefused =
      refused.has(key) ||
      (subject.table === 'point_results' && oddsRefused.has(subject.game));
    const againstOldApp = differing(n, b);
    const againstProduction = differing(n, a);
    const kind: ParityClass = isRefused
      ? 'refused'
      : againstOldApp.length > 0
        ? 'new-code-wrong'
        : againstProduction.length > 0
          ? 'stale'
          : 'match';
    counts[kind] += 1;
    if (kind === 'match') continue;
    const columns =
      kind === 'new-code-wrong'
        ? againstOldApp
        : kind === 'stale'
          ? againstProduction
          : [];
    rows.push({
      subject,
      class: kind,
      differences: columns.map((column) => ({
        column,
        production: valueOf(a, column),
        oldApp: valueOf(b, column),
        newCode: valueOf(n, column),
      })),
    });
  }
  return { table, counts, rows };
}

/**
 * Spec 1: every row key of one tournament's four points tables, classed
 * against both oracles. Exact: each value is compared as the text sportbet
 * stores (points in hundredths, standings in ten-thousandths, null apart
 * from zero), and a missing or an extra row differs. Pure.
 */
export function compareTournament(sides: ParitySides): readonly TableParity[] {
  return PARITY_TABLES.map((table) => compareTable(sides, table));
}
