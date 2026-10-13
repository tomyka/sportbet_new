import { Points } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { SURVIVAL_POINTS } from './survival-fold';
import { survivalLedger, type LedgerRound } from './survival-ledger';
import {
  gamesOf,
  playsSurvival,
  usedTeams,
  type PickContext,
  type SurvivalRun,
} from './survival-run';

export type CardState =
  | { readonly kind: 'open' }
  | { readonly kind: 'started' }
  | { readonly kind: 'used'; readonly round: RoundNumber | null };

/** One team's card on the survival page. */
export interface SurvivalCard {
  readonly team: TeamId;
  readonly opponent: TeamId;
  readonly ground: 'home' | 'away';
  readonly state: CardState;
  /** withPick would accept it: the page offers only what the save takes. */
  readonly selectable: boolean;
  readonly picked: boolean;
}

/** The current round's stored outcome for the player, once scored. */
export type SurvivalVerdict =
  | { readonly state: 'survived'; readonly points: Points }
  | { readonly state: 'lost' };

export type SurvivalPickPage =
  /** "Išlikimo žaidimas baigėsi." */
  | { readonly kind: 'over' }
  | {
      readonly kind: 'open';
      readonly round: RoundNumber;
      readonly picked: TeamId | null;
      readonly verdict: SurvivalVerdict | null;
      /** R-4: the pick's game has tipped off - the notice, every card disabled. */
      readonly pickLocked: boolean;
      /** "· Rinkis komandą": a pick can still be made. */
      readonly choosing: boolean;
      /** By team id. */
      readonly cards: readonly SurvivalCard[];
      readonly free: number;
      readonly used: number;
      /** The current run before this round: after the last loss, survived and pending. */
      readonly run: readonly LedgerRound[];
      /** "Iš eilės": the run's survived rounds. */
      readonly streak: number;
      /** "Surinkta serijoje": the sum of the run's stored rows. */
      readonly runPoints: Points;
      /** "Už šį turą": the run's last running total plus a home or an away win. */
      readonly stake: { readonly home: number; readonly away: number };
    };

export interface SurvivalPickPageInput {
  readonly season: Season;
  /** The tournament's teams (R-81). */
  readonly teams: readonly TeamId[];
  readonly survivalPlayed: boolean;
  readonly run: SurvivalRun;
  /** The player's stored rows of the rule set's source. */
  readonly rows: readonly SurvivalPoints[];
  readonly rules: RuleSet;
  readonly now: Instant;
}

/**
 * PredictionSurvivalController's page and survival.blade.php's reading of
 * it: over unless the current round plays survival; otherwise one card per
 * team playing in the round, selectable exactly when withPick accepts it,
 * and the run, streak and stake from the stored rows and the picks
 * (survivalLedger).
 */
export function survivalPickPage(
  input: SurvivalPickPageInput,
): SurvivalPickPage {
  const { season, run, rules, now } = input;
  const round = season.currentRound(now, rules);
  if (round === null || !playsSurvival(round, input, rules)) {
    return { kind: 'over' };
  }
  const context: PickContext = {
    season,
    teams: input.teams,
    survivalPlayed: input.survivalPlayed,
    now,
  };
  const ledger = survivalLedger(run, input.rows);
  const before = runBefore(ledger, round);
  const picked = run.picks.find((pick) => pick.round === round)?.team ?? null;
  const used = usedTeams(run, context, round);
  const cards = teamsPlaying(season, round).map((team) =>
    cardOf(team, { round, run, rules, context, used, before, picked }),
  );
  const pickLocked =
    picked !== null &&
    gamesOf(season, round, picked).some((game) => game.hasTippedOffAt(now));
  const verdict = verdictOf(ledger.find((line) => line.round === round));
  const usedCount = cards.filter((card) => card.state.kind === 'used').length;
  return {
    kind: 'open',
    round,
    picked,
    verdict,
    pickLocked,
    choosing:
      verdict === null && !pickLocked && cards.some((card) => card.selectable),
    cards,
    free: cards.length - usedCount,
    used: usedCount,
    run: before,
    streak: before.filter((line) => line.state === 'survived').length,
    runPoints: before.reduce(
      (sum, line) => (line.points === null ? sum : sum.plus(line.points)),
      Points.ZERO,
    ),
    stake: stakeAfter(before),
  };
}

interface CardInput {
  readonly round: RoundNumber;
  readonly run: SurvivalRun;
  readonly rules: RuleSet;
  readonly context: PickContext;
  readonly used: ReadonlySet<TeamId>;
  readonly before: readonly LedgerRound[];
  readonly picked: TeamId | null;
}

function cardOf(team: TeamId, input: CardInput): SurvivalCard {
  const games = gamesOf(input.context.season, input.round, team);
  const [first] = [...games].sort((a, b) => a.tipOff - b.tipOff || a.id - b.id);
  if (first === undefined)
    throw new Error(`team ${team} plays no game in the round`);
  return {
    team,
    opponent: first.home === team ? first.away : first.home,
    ground: first.home === team ? 'home' : 'away',
    state: stateOf(team, games, input),
    selectable: input.run.withPick(team, input.context, input.rules).ok,
    picked: input.picked === team,
  };
}

function stateOf(
  team: TeamId,
  games: readonly Game[],
  input: CardInput,
): CardState {
  if (input.used.has(team)) {
    const line = input.before.findLast((entry) => entry.team === team);
    return { kind: 'used', round: line?.round ?? null };
  }
  return games.every((game) => game.isOpenAt(input.context.now))
    ? { kind: 'open' }
    : { kind: 'started' };
}

/** The teams with a game in the round, by team id. */
function teamsPlaying(season: Season, round: RoundNumber): readonly TeamId[] {
  const teams = new Set<TeamId>();
  for (const game of season.games) {
    if (game.round !== round) continue;
    teams.add(game.home);
    teams.add(game.away);
  }
  return [...teams].sort(byTeamId);
}

/** Numerically, as the database's ids; a non-numeric id by its text. */
function byTeamId(a: TeamId, b: TeamId): number {
  return Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** The ledger's rounds before `round`, after the last loss. */
function runBefore(
  ledger: readonly LedgerRound[],
  round: RoundNumber,
): readonly LedgerRound[] {
  const earlier = ledger.filter((line) => line.round < round);
  const lastLoss = earlier.findLastIndex((line) => line.state === 'lost');
  return earlier.slice(lastLoss + 1);
}

function verdictOf(line: LedgerRound | undefined): SurvivalVerdict | null {
  const points = line?.points ?? null;
  if (points === null) return null;
  return points.isPositive()
    ? { state: 'survived', points }
    : { state: 'lost' };
}

/** The last running total of the run, plus a home or an away win (SU-1). */
function stakeAfter(run: readonly LedgerRound[]): {
  readonly home: number;
  readonly away: number;
} {
  const last =
    run.findLast((line) => line.points !== null)?.points ?? Points.ZERO;
  const whole = Math.trunc(last.hundredths / 100);
  return {
    home: whole + SURVIVAL_POINTS.homeWin,
    away: whole + SURVIVAL_POINTS.awayWin,
  };
}
