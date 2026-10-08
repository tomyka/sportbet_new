import { counted } from '../counted';
import { PARITY_CLASSES, PARITY_TABLES } from './compare';
import type { Placed } from './rankings';
import {
  parityOutcome,
  type ParityReport,
  type TournamentParityReport,
} from './report';
import type { Effect } from './rulings';

// The parity report as the reader prints it, section by section.

/** Ten-thousandths as signed decimal text, "-760.0000", without a float. */
function tenThousandthsText(units: number): string {
  const sign = units < 0 ? '-' : '';
  const size = Math.abs(units);
  const fraction = String(size % 10_000).padStart(4, '0');
  return `${sign}${String(Math.trunc(size / 10_000))}.${fraction}`;
}

/** Cents as decimal text, "1934.00", without a float. */
function centsText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const size = Math.abs(cents);
  return `${sign}${String(Math.trunc(size / 100))}.${String(size % 100).padStart(2, '0')}`;
}

function effectText(effect: Effect): string {
  switch (effect.kind) {
    case 'no-stored-row':
      return 'changes no stored row';
    case 'refused':
      return `refused (${effect.refusal})`;
    case 'changes':
      return `rows changed ${String(effect.rows)}, players affected ${String(effect.players)}, points changed ${tenThousandthsText(effect.points)}`;
  }
}

const placedText = (side: string, placed: Placed | null): string =>
  placed === null
    ? `not ranked by ${side}`
    : `rank ${String(placed.rank)} (${centsText(placed.totalCents)}) by ${side}`;

/** A tournament's counts per table and class. */
function countLines(each: TournamentParityReport): string[] {
  return [
    `  ${'table'.padEnd(16)}${PARITY_CLASSES.map((kind) => kind.padStart(15)).join('')}`,
    ...PARITY_TABLES.map(
      (table) =>
        `  ${table.padEnd(16)}${PARITY_CLASSES.map((kind) => String(each.counts[table][kind]).padStart(15)).join('')}`,
    ),
  ];
}

/** Each row the new code got wrong, column by column; then the stale columns. */
function wrongAndStaleLines(each: TournamentParityReport): string[] {
  const lines = each.wrong.flatMap(({ table, row, differences }) => [
    `  new-code-wrong ${table}: ${row}`,
    ...differences.map(
      ({ column, production, oldApp, newCode }) =>
        `    ${column}: production ${production}, old app ${oldApp}, new code ${newCode}`,
    ),
  ]);
  for (const table of PARITY_TABLES) {
    for (const [column, count] of Object.entries(each.stale[table])) {
      lines.push(`  stale ${table}.${column}: ${String(count)}`);
    }
  }
  return lines;
}

/** Each ruling's effect against sportbetRules, alone or on top of the one it needs. */
function rulingsLines(rulings: TournamentParityReport['rulings']): string[] {
  if (rulings === null) return [];
  const lines = [
    '  rulings against sportbetRules, each alone or on top of the ruling it needs:',
  ];
  if ('refusal' in rulings) {
    return [...lines, `    not computed: ${rulings.refusal}`];
  }
  for (const { label, measuredWith, effect } of rulings.fields) {
    const onTopOf = measuredWith === null ? '' : `, on top of ${measuredWith}`;
    lines.push(`    ${label}${onTopOf}: ${effectText(effect)}`);
  }
  const { remainder, ruled } = rulings;
  const together =
    remainder === null
      ? 'not computed, a run was refused'
      : `points changed ${tenThousandthsText(remainder)}`;
  lines.push(
    `    rulings acting together, beyond the lines above: ${together}`,
    `    all rulings (ruledRules): ${effectText(ruled)}`,
  );
  return lines;
}

/** Each league's ranking, and the players placed differently. */
function rankingLines(each: TournamentParityReport): string[] {
  return each.rankings.flatMap(({ league, players, differences }) => [
    `  rankings of league ${String(league)}: ${String(players)} players, ${String(differences.length)} differ`,
    ...differences.map(
      ({ username, newCode, oldApp }) =>
        `    ${username}: ${placedText('the new code', newCode)}, ${placedText('sportbet', oldApp)}`,
    ),
  ]);
}

/** One tournament's section. */
function tournamentLines(each: TournamentParityReport): string[] {
  const head = ['', `tournament ${each.tournament}`];
  if (each.notCompared !== null) {
    return [...head, `  not compared: ${each.notCompared}`];
  }
  return [
    ...head,
    ...countLines(each),
    ...wrongAndStaleLines(each),
    ...rulingsLines(each.rulings),
    ...rankingLines(each),
  ];
}

/** The /leaderboard comparison. */
function leaderboardLines(leaderboard: ParityReport['leaderboard']): string[] {
  if (leaderboard === null) {
    return ['leaderboard: not compared, a tournament was not compared'];
  }
  const { players, differences } = leaderboard;
  return [
    `leaderboard: ${String(players)} players, ${String(differences.length)} differ`,
    ...differences.map(
      ({ username, newCode, oldApp }) =>
        `  ${username}: ${placedText('the new code', newCode)}, ${placedText('sportbet', oldApp)}`,
    ),
  ];
}

/** The old app's rows dropped with their parent, and what cannot be checked. */
function closingLines(report: ParityReport): string[] {
  return [
    '',
    "sportbet's recalculated rows not compared, as what they belong to did not load:",
    ...PARITY_TABLES.map((table) => {
      const { skipped, refused } = report.oldAppDropped[table];
      return `  ${table.padEnd(17)} skipped: ${counted(skipped)}; refused: ${counted(refused)}`;
    }),
    '',
    'cannot check:',
    ...report.cannotCheck.map((line) => `  ${line}`),
    '',
    parityOutcome(report).verdict,
  ];
}

/** The parity report as the reader prints it, after the load report. */
export function renderParity(report: ParityReport): string[] {
  return [
    `parity against sportbet ${report.tag}, backup ${report.backup}`,
    ...report.tournaments.flatMap(tournamentLines),
    '',
    ...leaderboardLines(report.leaderboard),
    ...closingLines(report),
  ];
}
