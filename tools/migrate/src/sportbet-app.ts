import { playerOf } from '@sportbet/db';
import { decimalUnits, ok, refuse, type Result } from '@sportbet/domain';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedTestContainer } from 'testcontainers';
import { z } from 'zod';
import {
  joinNetwork,
  runInSportbetApp,
  startNetwork,
  startSportbetApp,
  stopSportbetApp,
} from './containers';
import type { OldAppRank } from './parity/rankings';
import { issuesSummary, ReaderProblem } from './problem';

/** A commit of sportbet, as its deploys tag the image: 7 to 40 hex digits. */
const SPORTBET_TAG = /^[0-9a-f]{7,40}$/;

/**
 * The command's `--parity` and `--sportbet-tag`: the parity stage's tag,
 * none without `--parity`, or why the two do not go together. The tag is
 * required - a run against a tag that is not production's proves nothing -
 * and is a commit, as production's deploys tag its image.
 */
export function parityOptionOf(
  parity: boolean,
  tag: string | undefined,
): Result<{ readonly tag: string } | null, string> {
  if (!parity) {
    return tag === undefined
      ? ok(null)
      : refuse('--sportbet-tag needs --parity');
  }
  if (tag === undefined)
    return refuse('--parity needs --sportbet-tag <commit>');
  return SPORTBET_TAG.test(tag)
    ? ok({ tag })
    : refuse('--sportbet-tag is a commit of sportbet: 7 to 40 hex digits');
}

/**
 * What the old app runs, in one `php artisan tinker --execute` (spec 2):
 * sportbet's full recalculation (what /admin/recalculateAllGamePoints runs:
 * every scored game rescored, the serija rebuilt, survival refolded from
 * the stored rows; no fill-ins and no odds), the standings recalculation
 * (/admin/updateStandingPoints), and every league's leaderboard with every
 * member visible (the highest guest level), ranked by sportbet's Ranking.
 * It prints a marker after each step and the rankings as ids, ranks and
 * totals to the cent - never a username, a name or an email.
 */
export const OLD_APP_SCRIPT = [
  'app(App\\Services\\Recalculation::class)->all();',
  'echo "PARITY-STEP recalculated\\n";',
  'app(App\\Http\\Controllers\\PointStandingController::class)->updateStandingPoints();',
  'echo "PARITY-STEP standings\\n";',
  '$rows = [];',
  "foreach (Illuminate\\Support\\Facades\\DB::table('leagues')->orderBy('id')->pluck('id') as $league) {",
  '    foreach (app(App\\Http\\Controllers\\PointController::class)->getAllUserPoints((int) $league, PHP_INT_MAX) as $row) {',
  "        $rows[] = ['league' => (int) $league, 'user' => (int) $row['userID'], 'rank' => (int) $row['rank'], 'total' => number_format(App\\Support\\Ranking::leaderboardTotal($row), 2, '.', '')];",
  '    }',
  '}',
  'echo \'PARITY-RANKINGS \', json_encode($rows), "\\n";',
].join('\n');

const STEPS = ['recalculated', 'standings'] as const;
const RANKINGS = 'PARITY-RANKINGS ';

const printedRanks = z.array(
  z.object({
    league: z.int().positive(),
    user: z.int().positive(),
    rank: z.int().positive(),
    total: z.string(),
  }),
);

/**
 * The old app's output, parsed: its rankings, or why they cannot be read
 * - the exit code and how many steps it finished, never a line of what it
 * printed, which an error could fill with a row's values.
 */
export function parseOldAppOutput(
  exitCode: number,
  stdout: string,
): Result<readonly OldAppRank[], string> {
  const lines = stdout.split(/\r?\n/);
  const done = STEPS.filter((step) =>
    lines.includes(`PARITY-STEP ${step}`),
  ).length;
  if (exitCode !== 0) {
    return refuse(
      `exited with ${String(exitCode)} after ${String(done)} of 3 steps`,
    );
  }
  const printed = lines.find((line) => line.startsWith(RANKINGS));
  if (done < STEPS.length || printed === undefined) {
    return refuse(`finished ${String(done)} of 3 steps`);
  }
  let json: unknown;
  try {
    json = JSON.parse(printed.slice(RANKINGS.length));
  } catch {
    return refuse('printed rankings that are not JSON');
  }
  const rows = printedRanks.safeParse(json);
  if (!rows.success) {
    return refuse(
      `printed rankings that do not parse (${issuesSummary(rows.error.issues)})`,
    );
  }
  const ranks: OldAppRank[] = [];
  for (const row of rows.data) {
    const cents = decimalUnits(row.total, 2);
    if (!cents.ok) {
      return refuse(`printed a total that is not a decimal (${cents.refusal})`);
    }
    ranks.push({
      league: row.league,
      player: playerOf(row.user),
      rank: row.rank,
      totalCents: cents.value,
    });
  }
  return ok(ranks);
}

/** What the old app's run makes, so the run's cleanup removes it on every path. */
export interface OldAppResources {
  /** The run's id: the value of the label on everything it makes. */
  readonly id: string;
  network: string | null;
  sportbetApp: StartedTestContainer | null;
}

/**
 * Oracle (b), spec 2: sportbet's own app at `tag` recalculates the restored
 * copy in `mysql` - on the run's private network, through containers.ts -
 * and ranks every league. Its rankings; its rows are then read back from
 * the MySQL. The app's container is removed as soon as it is done; the
 * network goes with the MySQL.
 */
export async function runSportbetApp(
  resources: OldAppResources,
  tag: string,
  mysql: StartedMySqlContainer,
): Promise<readonly OldAppRank[]> {
  resources.network = await startNetwork(resources.id);
  await joinNetwork(resources.network, mysql);
  const app = await startSportbetApp(
    resources.id,
    tag,
    resources.network,
    mysql.getRootPassword(),
  );
  resources.sportbetApp = app;
  const { exitCode, stdout } = await runInSportbetApp(app, OLD_APP_SCRIPT);
  await stopSportbetApp(app);
  resources.sportbetApp = null;
  const ranks = parseOldAppOutput(exitCode, stdout);
  if (!ranks.ok) {
    throw new ReaderProblem(`sportbet's own recalculation ${ranks.refusal}`);
  }
  return ranks.value;
}
