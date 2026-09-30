import type { PointsSource, PointsTable } from '@sportbet/db';
import type { Recalculation } from './load';
import type { TableCount } from './map';

/**
 * The load report: counts, the sportbet ids of rows no player owns, and the
 * dump's name, size and hash. Never a username, name, email or player id.
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
  cleanup: [],
  problem: null,
  exitStatus: 2,
});

/** The exit status a finished run's report earns. */
export function exitStatusOf(report: Report): 0 | 1 | 2 {
  if (report.problem !== null) return 2;
  const refused =
    report.tables.some((table) => table.refusals.length > 0) ||
    report.recalculations.some(({ refusal }) => refusal !== null);
  return refused ? 1 : 0;
}

const counted = (counts: Readonly<Record<string, number>>) =>
  Object.entries(counts)
    .map(([reason, count]) => `${reason} ${String(count)}`)
    .join(', ') || '-';

/** The report as the reader prints it. */
export function renderReport(report: Report): string {
  const lines: string[] = ['sportbet production-copy load report', ''];
  if (report.dump !== null) {
    const { dump } = report;
    lines.push(
      `dump    ${dump.object}`,
      `        ${String(dump.bytes)} bytes, sha256 ${dump.sha256}`,
      `        ${String(dump.ageHours)} hours old${dump.stale ? ' - WARNING: older than 26 hours' : ''}`,
      `        ${dump.engine}, restored on ${dump.image}`,
      '',
    );
  }
  if (report.tables.length > 0) {
    lines.push('table                  dump  read loaded  skipped / refused');
    for (const table of report.tables) {
      lines.push(
        `${table.table.padEnd(21)} ${String(table.inDump).padStart(5)} ${String(table.read).padStart(5)} ${String(table.loaded).padStart(6)}  skipped: ${counted(table.skipped)}; refused: ${counted(table.refused)}`,
      );
      for (const { reason, row } of table.refusals) {
        if (row !== '')
          lines.push(`${' '.repeat(23)}refused ${reason}: ${row}`);
      }
    }
    lines.push('');
  }
  for (const notice of report.notices) lines.push(`notice  ${notice}`);
  if (report.notices.length > 0) lines.push('');
  for (const { tournament, rows } of report.points) {
    lines.push(
      `points of tournament ${String(tournament)} (production / sportbet / ruled)`,
    );
    for (const [table, sources] of Object.entries(rows)) {
      lines.push(
        `        ${table.padEnd(17)} ${String(sources.production)} / ${String(sources.sportbet)} / ${String(sources.ruled)}`,
      );
    }
  }
  for (const { tournament, rules, refusal } of report.recalculations) {
    if (refusal !== null) {
      lines.push(
        `recalculation refused: tournament ${String(tournament)} under ${rules}: ${refusal}`,
      );
    }
  }
  if (report.problem !== null)
    lines.push(`could not complete: ${report.problem}`);
  for (const line of report.cleanup) lines.push(`cleanup ${line}`);
  lines.push(`exit    ${String(report.exitStatus)}`);
  return `${lines.join('\n')}\n`;
}
