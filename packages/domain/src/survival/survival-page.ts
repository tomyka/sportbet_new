import { Points } from '../points/points';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { survivalGroundPays } from './survival-fold';
import {
  runAfterLastLoss,
  streakOf,
  survivalLedger,
  type LedgerRound,
} from './survival-ledger';
import {
  gamesOf,
  playsSurvival,
  type PickContext,
  type PickRefusal,
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
  /** withPick refuses it for none of its questions: the page offers only what the save takes. */
  readonly selectable: boolean;
  readonly picked: boolean;
}

/** The current round's stored outcome for the player, once scored; points as the page prints them (whole). */
export type SurvivalVerdict =
  | { readonly state: 'survived'; readonly points: number }
  | { readonly state: 'lost' };

/** One round of the current run, its running total as the page prints it (whole). */
export interface RunLeg {
  readonly round: RoundNumber;
  readonly team: TeamId;
  readonly state: 'survived' | 'pending';
  /** Null while pending. */
  readonly points: number | null;
}

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
      /** R-4's notice: the pick is locked and the round not yet scored. */
      readonly lockNotice: boolean;
      /** "· Rinkis komandą": a pick can still be made. */
      readonly choosing: boolean;
      /** By team id. */
      readonly cards: readonly SurvivalCard[];
      readonly free: number;
      readonly used: number;
      /** The current run before this round: after the last loss, survived and pending. */
      readonly run: readonly RunLeg[];
      /** "Iš eilės": the run's survived rounds. */
      readonly streak: number;
      /** "Surinkta serijoje": the sum of the run's stored rows. */
      readonly runPoints: number;
      /** "Už šį turą": the run's last running total plus a home or an away win. */
      readonly stake: { readonly home: number; readonly away: number };
      /** What one winning round pays at home and away under the rule set (SU-1, R-138): the rules card's figures. */
      readonly pays: { readonly home: number; readonly away: number };
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
  const before = runAfterLastLoss(ledger.filter((line) => line.round < round));
  const picked = run.picks.find((pick) => pick.round === round)?.team ?? null;
  const refusals = run.refusalsFor(teamsPlaying(season, round), context, rules);
  const cards = [...refusals].map(([team, why]) =>
    cardOf(team, why, { season, round, before, picked, now }),
  );
  // R-4 is a question about the round's held pick, so every team's refusals
  // carry it alike.
  const pickLocked = [...refusals.values()].some((why) =>
    why.includes('pick-locked'),
  );
  const verdict = verdictOf(ledger.find((line) => line.round === round));
  const usedCount = cards.filter((card) => card.state.kind === 'used').length;
  return {
    kind: 'open',
    round,
    picked,
    verdict,
    pickLocked,
    lockNotice: pickLocked && verdict === null,
    choosing:
      verdict === null && !pickLocked && cards.some((card) => card.selectable),
    cards,
    free: cards.length - usedCount,
    used: usedCount,
    run: before.map(legOf),
    streak: streakOf(before),
    runPoints: before
      .reduce(
        (sum, line) => (line.points === null ? sum : sum.plus(line.points)),
        Points.ZERO,
      )
      .wholePart(),
    stake: stakeAfter(before, rules),
    pays: {
      home: survivalGroundPays('home', rules),
      away: survivalGroundPays('away', rules),
    },
  };
}

interface CardInput {
  readonly season: Season;
  readonly round: RoundNumber;
  readonly before: readonly LedgerRound[];
  readonly picked: TeamId | null;
  readonly now: Instant;
}

function cardOf(
  team: TeamId,
  refusals: readonly PickRefusal[],
  input: CardInput,
): SurvivalCard {
  const games = gamesOf(input.season, input.round, team);
  const [first] = [...games].sort((a, b) => a.tipOff - b.tipOff || a.id - b.id);
  if (first === undefined)
    throw new Error(`team ${team} plays no game in the round`);
  return {
    team,
    opponent: first.home === team ? first.away : first.home,
    ground: first.home === team ? 'home' : 'away',
    state: stateOf(team, refusals, input.before),
    selectable: refusals.length === 0,
    picked: input.picked === team,
  };
}

/** The card's state from withPick's refusals: used, else started, else open. */
function stateOf(
  team: TeamId,
  refusals: readonly PickRefusal[],
  before: readonly LedgerRound[],
): CardState {
  if (refusals.includes('team-used-in-run')) {
    const line = before.findLast((entry) => entry.team === team);
    return { kind: 'used', round: line?.round ?? null };
  }
  return refusals.includes('team-already-started')
    ? { kind: 'started' }
    : { kind: 'open' };
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

function verdictOf(line: LedgerRound | undefined): SurvivalVerdict | null {
  const points = line?.points ?? null;
  if (points === null) return null;
  return points.isPositive()
    ? { state: 'survived', points: points.wholePart() }
    : { state: 'lost' };
}

function legOf(line: LedgerRound): RunLeg {
  return {
    round: line.round,
    team: line.team,
    state: line.state === 'survived' ? 'survived' : 'pending',
    points: line.points?.wholePart() ?? null,
  };
}

/** The last running total of the run, plus a home or an away win (SU-1). */
function stakeAfter(
  run: readonly LedgerRound[],
  rules: RuleSet,
): {
  readonly home: number;
  readonly away: number;
} {
  const last =
    run.findLast((line) => line.points !== null)?.points ?? Points.ZERO;
  const whole = last.wholePart();
  return {
    home: whole + survivalGroundPays('home', rules),
    away: whole + survivalGroundPays('away', rules),
  };
}
