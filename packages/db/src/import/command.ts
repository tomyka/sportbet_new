import {
  parseEuroleagueFeed,
  seasonCodeSchema,
  type EuroleagueFeed,
  type FeedFailure,
  type FeedRefusal,
  type FeedSeason,
  type ImportPlan,
  type Instant,
  type SeasonCode,
  type Tournament,
} from '@sportbet/domain';
import type { DatabaseClock } from '../clock';
import type { Executor } from '../client';
import {
  findTournamentById,
  findTournamentBySlug,
} from '../tournament/repository';
import { applyEuroleagueImport, type ApplyRefusal } from './apply';
import { previewEuroleagueImport, type ImportRequest } from './preview';

/** What the command runs on: the database, the feed and the moment it judges at. */
export interface ImportCommandContext {
  readonly db: Executor;
  readonly feed: EuroleagueFeed;
  readonly now: Instant;
  /** One line of output. */
  readonly out: (line: string) => void;
  /** The moment an apply is judged at; the database's own clock when left out. */
  readonly clock?: DatabaseClock;
}

const DEFAULT_SEASON = 'E2026';

/**
 * A line with every control character (C0, DEL, C1) removed: the feed's
 * strings are printed, and an escape sequence in one must not reach the
 * terminal. The parser refuses such a name already; this is the second wall.
 */
export const printable = (line: string): string => line.replace(/\p{Cc}/gu, '');

interface Arguments {
  readonly tournament: string;
  readonly season: string;
  readonly dryRun: boolean;
}

/** sportbet's `euroleague:import {tournament} {--season=E2026} {--dry-run}`; null when it does not parse. */
function parseArguments(argv: readonly string[]): Arguments | null {
  const positional: string[] = [];
  let season = DEFAULT_SEASON;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--dry-run') dryRun = true;
    else if (argument === '--season') {
      season = argv[(index += 1)] ?? '';
    } else if (argument.startsWith('--season=')) {
      season = argument.slice('--season='.length);
    } else if (argument.startsWith('--')) return null;
    else positional.push(argument);
  }
  const [tournament, ...rest] = positional;
  return tournament === undefined || rest.length > 0
    ? null
    : { tournament, season, dryRun };
}

/** `Tournament::where('slug', $key)->orWhere('id', $key)`: the slug first, then the id. */
async function findTournament(
  db: Executor,
  key: string,
): Promise<Tournament | undefined> {
  const bySlug = await findTournamentBySlug(db, key);
  if (bySlug !== undefined) return bySlug;
  return /^[1-9][0-9]{0,9}$/u.test(key) && Number(key) <= 2_147_483_647
    ? findTournamentById(db, Number(key))
    : undefined;
}

/** A failure of the feed or a refusal of its payload, in sportbet's words (Lithuanian, as its exceptions were). */
function feedText(
  problem: FeedFailure | FeedRefusal,
  season: SeasonCode,
): string {
  switch (problem.kind) {
    case 'unreachable':
      return 'Nepavyko pasiekti Euroleague serverio. Bandykite dar kartą po kelių minučių.';
    case 'http-error':
      return `Euroleague serveris grąžino klaidą (${String(problem.status)}). Patikrinkite sezono kodą ${season}.`;
    case 'not-json':
      return 'Euroleague atsakymo nepavyko perskaityti.';
    case 'no-games':
      return 'Euroleague atsakyme nėra rungtynių. Patikrinkite sezono kodą.';
    case 'malformed':
      return `Euroleague atsakymas netinkamas: rungtynėse nr. ${String(problem.number)} trūksta lauko ${problem.field}.`;
  }
}

/** A refusal of the plan or the apply, in sportbet's words where it had them. */
export function planText(refusal: ApplyRefusal): string {
  switch (refusal.kind) {
    case 'tournament-finished':
      return 'Turnyras baigtas - keisti negalima.';
    case 'duplicate-team-names':
      return `Turnyre yra dvi vienodai vadinamos komandos: ${refusal.team}. Pervadinkite vieną iš jų ir bandykite dar kartą.`;
    case 'unmatched-teams':
      return `Šios komandos yra tvarkaraštyje, bet ne turnyre: ${refusal.teams.join(', ')}. Pervadinkite jas turnyre taip pat, kaip vadinasi tvarkaraštyje, ir bandykite dar kartą. Niekas nebuvo importuota.`;
    case 'round-not-regular':
      return `Turas ${String(refusal.round)} jau yra ir nėra reguliariojo sezono.`;
    case 'duplicate-fixture':
      return `Euroleague atsakyme rungtynės kartojasi: ${String(refusal.round)} turas, ${refusal.home} - ${refusal.away}.`;
    case 'plan-changed':
      return 'Tvarkaraštis arba turnyras pasikeitė po peržiūros - peržiūrėkite dar kartą.';
    case 'no-tournament':
      return 'Turnyro nebėra.';
  }
}

/** sportbet's table (ImportEuroleagueSchedule.php 52-60) and the three lines R-94 and R-96 add. */
function tableOf(plan: ImportPlan): string[] {
  const table: [string, number][] = [
    ['Teams to create', plan.teamsToCreate.length],
    ['Events to create', plan.roundsToCreate.length],
    ['Games to create', plan.gamesToCreate.length],
    ['Games to reschedule', plan.moves.length],
    ['Games unchanged', plan.unchanged],
    ['Locked, reschedule refused', plan.skippedMoves.length],
    ['Players affected', plan.playersAffected],
    ['Post-season left out', plan.postSeasonLeftOut],
    ['Dropped from the feed', plan.dropped.length],
    ['Teams without a crest', plan.teamsWithoutCrest.length],
  ];
  const width = Math.max(...table.map(([label]) => label.length));
  return [
    `${'Change'.padEnd(width)}  Count`,
    ...table.map(([label, n]) => `${label.padEnd(width)}  ${String(n)}`),
  ];
}

function listsOf(plan: ImportPlan): string[] {
  const lines: string[] = [];
  if (plan.dropped.length > 0) {
    lines.push(
      `Dropped from the feed: ${plan.dropped.map((game) => `${String(game.round)}: ${game.label}`).join('; ')}`,
    );
  }
  if (plan.teamsWithoutCrest.length > 0) {
    lines.push(`Teams without a crest: ${plan.teamsWithoutCrest.join(', ')}`);
  }
  return lines;
}

/** Prints the plan; applies it with the fingerprint it just made unless `dryRun`. */
async function previewAndApply(
  context: ImportCommandContext,
  request: ImportRequest,
  dryRun: boolean,
): Promise<number> {
  const { out } = context;
  const preview = await previewEuroleagueImport(context.db, request);
  if (!preview.ok) {
    out(planText(preview.refusal));
    return 1;
  }
  for (const line of [
    ...tableOf(preview.value.plan),
    ...listsOf(preview.value.plan),
  ]) {
    out(line);
  }
  if (dryRun) {
    out('Dry run: nothing was written.');
    return 0;
  }
  const applied = await applyEuroleagueImport(
    context.db,
    { ...request, fingerprint: preview.value.fingerprint },
    context.clock,
  );
  if (!applied.ok) {
    out(planText(applied.refusal));
    return 1;
  }
  const done = applied.value;
  out(
    `Imported ${String(done.teams)} teams, ${String(done.rounds)} events, ${String(done.games)} games (${String(done.moved)} rescheduled, ${String(done.skipped)} locked and left alone); seeded ${String(done.playersSeeded)} players.`,
  );
  return 0;
}

/** The feed's regular season, or the words for why it could not be read. */
async function readFixtures(
  feed: EuroleagueFeed,
  season: SeasonCode,
): Promise<{ ok: true; value: FeedSeason } | { ok: false; refusal: string }> {
  const answer = await feed.games(season);
  if (!answer.ok)
    return { ok: false, refusal: feedText(answer.refusal, season) };
  const parsed = parseEuroleagueFeed(answer.value);
  return parsed.ok
    ? parsed
    : { ok: false, refusal: feedText(parsed.refusal, season) };
}

/**
 * sportbet's `euroleague:import <tournament id or slug> [--season E2026]
 * [--dry-run]` over the same plan and apply the admin screen runs: prints the
 * plan as a table, and applies it with the fingerprint it just made unless
 * `--dry-run`. Returns the exit code: 1 for an unknown tournament, a bad
 * season code, a feed failure or any refusal.
 */
export async function runEuroleagueImportCommand(
  argv: readonly string[],
  context: ImportCommandContext,
): Promise<number> {
  const out = (line: string): void => {
    context.out(printable(line));
  };
  const args = parseArguments(argv);
  if (args === null) {
    out(
      'Usage: euroleague-import <tournament id or slug> [--season E2026] [--dry-run]',
    );
    return 1;
  }
  const tournament = await findTournament(context.db, args.tournament);
  if (tournament === undefined) {
    out(`No tournament matches "${args.tournament}".`);
    return 1;
  }
  const season = seasonCodeSchema.safeParse(args.season);
  if (!season.success) {
    out('Netinkamas sezono kodas.');
    return 1;
  }
  const fixtures = await readFixtures(context.feed, season.data);
  if (!fixtures.ok) {
    out(fixtures.refusal);
    return 1;
  }
  const request = {
    tournament,
    fixtures: fixtures.value.fixtures,
    postSeasonLeftOut: fixtures.value.postSeasonLeftOut,
    now: context.now,
  };
  return previewAndApply({ ...context, out }, request, args.dryRun);
}
