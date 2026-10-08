import {
  POINTS_SOURCES,
  type PointsSource,
  type PointsTable,
} from '@sportbet/db';
import { counted } from './counted';
import type { Recalculation } from './load';
import type { TableCount } from './map';
import { renderParity } from './parity/render';
import { parityOutcome, type ParityReport } from './parity/report';

/**
 * The load report: counts, the sportbet ids of rows no player owns, and the
 * dump's name, size and hash. Never a name, an email or a player id; a
 * username only in the parity report, which the owner reads on this PC
 * (spec 2.3, usernames on screen).
 */
export interface Report {
  readonly dump: {
    readonly object: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly ageHours: number;
    readonly stale: boolean;
    readonly engine: string;
    readonly image: string;
  } | null;
  /** Per sportbet table: rows in the dump, then the reconciliation. */
  readonly tables: readonly (TableCount & { readonly inDump: number })[];
  readonly notices: readonly string[];
  readonly points: readonly {
    readonly tournament: number;
    readonly rows: Record<PointsTable, Record<PointsSource, number>>;
  }[];
  readonly recalculations: readonly Recalculation[];
  /** The parity report (`--parity`); null without it. */
  readonly parity: ParityReport | null;
  readonly cleanup: readonly string[];
  /** Why the run could not complete, if it could not. */
  readonly problem: string | null;
  /** 0 nothing refused, 1 something refused, 2 the run could not complete. */
  readonly exitStatus: 0 | 1 | 2;
}

export const emptyReport = (): Report => ({
  dump: null,
  tables: [],
  notices: [],
  points: [],
  recalculations: [],
  parity: null,
  cleanup: [],
  problem: null,
  exitStatus: 2,
});

/**
 * The exit status a finished run's report earns: 1 when a row was refused,
 * a recalculation was refused, or - with `--parity` - the parity outcome
 * says so (parityOutcome).
 */
export function exitStatusOf(report: Report): 0 | 1 | 2 {
  if (report.problem !== null) return 2;
  const refused =
    report.tables.some((table) => table.refusals.length > 0) ||
    report.recalculations.some(({ refusal }) => refusal !== null);
  const parity =
    report.parity === null ? 0 : parityOutcome(report.parity).exitStatus;
  return refused || parity === 1 ? 1 : 0;
}

/** The dump's lines: its object, size and hash, age, engine and image. */
function dumpLines(dump: NonNullable<Report['dump']>): string[] {
  return [
    `dump    ${dump.object}`,
    `        ${String(dump.bytes)} bytes, sha256 ${dump.sha256}`,
    `        ${String(dump.ageHours)} hours old${dump.stale ? ' - WARNING: older than 26 hours' : ''}`,
    `        ${dump.engine}, restored on ${dump.image}`,
    '',
  ];
}

/** Each table's reconciliation, and the sportbet ids of its refused rows. */
function tableLines(tables: Report['tables']): string[] {
  if (tables.length === 0) return [];
  const lines = ['table                  dump  read loaded  skipped / refused'];
  for (const table of tables) {
    lines.push(
      `${table.table.padEnd(21)} ${String(table.inDump).padStart(5)} ${String(table.read).padStart(5)} ${String(table.loaded).padStart(6)}  skipped: ${counted(table.skipped)}; refused: ${counted(table.refused)}`,
    );
    for (const { reason, row } of table.refusals) {
      if (row !== '') lines.push(`${' '.repeat(23)}refused ${reason}: ${row}`);
    }
  }
  return [...lines, ''];
}

/** Each loaded tournament's points rows per table and source. */
function pointsLines(points: Report['points']): string[] {
  return points.flatMap(({ tournament, rows }) => [
    `points of tournament ${String(tournament)} (${POINTS_SOURCES.join(' / ')})`,
    ...Object.entries(rows).map(([table, sources]) => {
      const counts = POINTS_SOURCES.map((source) => String(sources[source]));
      return `        ${table.padEnd(17)} ${counts.join(' / ')}`;
    }),
  ]);
}

/** The run's end: each refused recalculation, the parity report, the problem, the cleanup. */
function closingLines(report: Report): string[] {
  const lines = report.recalculations.flatMap(
    ({ tournament, rules, refusal }) =>
      refusal === null
        ? []
        : [
            `recalculation refused: tournament ${String(tournament)} under ${rules}: ${refusal}`,
          ],
  );
  if (report.parity !== null) {
    lines.push('', ...renderParity(report.parity), '');
  }
  if (report.problem !== null) {
    lines.push(`could not complete: ${report.problem}`);
  }
  for (const line of report.cleanup) lines.push(`cleanup ${line}`);
  return lines;
}

/** The report as the reader prints it. */
export function renderReport(report: Report): string {
  const notices = report.notices.map((notice) => `notice  ${notice}`);
  const lines = [
    'sportbet production-copy load report',
    '',
    ...(report.dump === null ? [] : dumpLines(report.dump)),
    ...tableLines(report.tables),
    ...notices,
    ...(notices.length > 0 ? [''] : []),
    ...pointsLines(report.points),
    ...closingLines(report),
    `exit    ${String(report.exitStatus)}`,
  ];
  return `${lines.join('\n')}\n`;
}
