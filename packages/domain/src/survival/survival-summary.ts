import { Points } from '../points/points';
import { usernameOrder } from '../ranking/league-table';
import type { TournamentTotal } from '../recalculation/recalculation';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { Season } from '../round/season';
import type { PlayerId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import {
  runAfterLastLoss,
  streakOf,
  survivalLedger,
  type LedgerRound,
} from './survival-ledger';
import {
  gamesOf,
  hasTippedOff,
  playsSurvival,
  SurvivalRun,
} from './survival-run';

/** One round's tile on the survival summary. */
export interface SummaryTile {
  readonly round: RoundNumber;
  readonly state: 'hit' | 'miss' | 'pending' | 'none';
  /** Null for none, and for a pick hidden from this viewer (R-82). */
  readonly team: TeamId | null;
  /** "Pasirinkta": another player's pick before its game tips off (R-82, R-101). */
  readonly hidden: boolean;
  /** The stored running total, whole as the page prints it; null while pending. */
  readonly points: number | null;
}

/** One listed player's row on the survival summary. */
export interface SummaryRow {
  /** The position, 1-based: no shared ranks. */
  readonly rank: number;
  readonly player: PlayerId;
  readonly username: string;
  readonly initials: string;
  readonly me: boolean;
  /** One per summary round. */
  readonly tiles: readonly SummaryTile[];
  /** "Iš eilės": SurvivalSummary::trailingHits (streakOf the rounds shown). */
  readonly streak: number;
  /** The player's stored survival total (TournamentTotal.survival), whole as the page prints it. */
  readonly total: number;
  /** R-83: "~" - a stored row in the rounds shown is provisional. */
  readonly provisional: boolean;
}

export interface SurvivalSummary {
  readonly rounds: readonly RoundNumber[];
  readonly rows: readonly SummaryRow[];
}

export interface SummaryPlayer {
  readonly player: PlayerId;
  readonly username: string;
  readonly initials: string;
}

export interface SurvivalSummaryInput {
  readonly season: Season;
  readonly now: Instant;
  /** The tournament plays survival (sportbet's `survival_game`). */
  readonly survivalPlayed: boolean;
  readonly viewer: PlayerId;
  /** The listed players (R-73). */
  readonly players: readonly SummaryPlayer[];
  readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
  /** The rule set's stored survival rows. */
  readonly rows: readonly SurvivalPoints[];
  readonly totals: readonly TournamentTotal[];
}

/**
 * PredictionSurvivalController::getPredictionSurvivalSummary: the survival
 * rounds up to the current one (R-84), and a row per listed player - a
 * tile per round from the stored rows and the picks (survivalLedger),
 * another player's pending pick hidden until its game tips off or has a
 * result (R-82, R-101), the trailing run, the stored total marked
 * provisional (R-83) - ordered by total, then the trailing run, then the
 * tie order on usernames (R-30).
 */
export function survivalSummary(input: SurvivalSummaryInput): SurvivalSummary {
  const rounds = summaryRounds(input);
  const rowsOf = rowsByPlayer(input.rows);
  const unranked = input.players.map((listed) =>
    rowOf(listed, rounds, rowsOf.get(listed.player) ?? [], input),
  );
  const byName = usernameOrder();
  const rows = unranked
    .sort(
      (a, b) =>
        b.total.hundredths - a.total.hundredths ||
        b.line.streak - a.line.streak ||
        byName(a.line.username, b.line.username),
    )
    .map(({ line }, index) => ({ ...line, rank: index + 1 }));
  return { rounds, rows };
}

/** R-84: the survival rounds numbered up to the current one, or all of them. */
function summaryRounds(input: SurvivalSummaryInput): readonly RoundNumber[] {
  const { season, survivalPlayed } = input;
  const current = season.currentRound(input.now);
  return season.rounds
    .map((round) => round.number)
    .filter(
      (round) =>
        playsSurvival(round, { season, survivalPlayed }) &&
        (current === null || round <= current),
    )
    .sort((a, b) => a - b);
}

/** The stored rows grouped by player, once. */
function rowsByPlayer(
  rows: readonly SurvivalPoints[],
): ReadonlyMap<PlayerId, readonly SurvivalPoints[]> {
  const byPlayer = new Map<PlayerId, SurvivalPoints[]>();
  for (const row of rows) {
    byPlayer.set(row.player, [...(byPlayer.get(row.player) ?? []), row]);
  }
  return byPlayer;
}

/** A player's row before ranking, with the exact total the ranking orders by. */
interface UnrankedRow {
  readonly line: Omit<SummaryRow, 'rank'>;
  readonly total: Points;
}

function rowOf(
  listed: SummaryPlayer,
  rounds: readonly RoundNumber[],
  stored: readonly SurvivalPoints[],
  input: SurvivalSummaryInput,
): UnrankedRow {
  const ledger = survivalLedger(
    input.runs.get(listed.player) ?? SurvivalRun.EMPTY,
    stored,
  );
  const me = listed.player === input.viewer;
  const shown = ledger.filter((line) => rounds.includes(line.round));
  const tiles = rounds.map((round) =>
    tileOf(
      round,
      shown.find((line) => line.round === round),
      me,
      input,
    ),
  );
  const total =
    input.totals.find((entry) => entry.player === listed.player)?.survival ??
    Points.ZERO;
  return {
    line: {
      player: listed.player,
      username: listed.username,
      initials: listed.initials,
      me,
      tiles,
      streak: streakOf(runAfterLastLoss(shown)),
      total: total.wholePart(),
      provisional: shown.some((line) => line.provisional),
    },
    total,
  };
}

const TILE_STATES = {
  survived: 'hit',
  lost: 'miss',
  pending: 'pending',
} as const;

function tileOf(
  round: RoundNumber,
  line: LedgerRound | undefined,
  me: boolean,
  input: SurvivalSummaryInput,
): SummaryTile {
  if (line === undefined) {
    return { round, state: 'none', team: null, hidden: false, points: null };
  }
  const hidden = line.state === 'pending' && !me && !isRevealed(line, input);
  return {
    round,
    state: TILE_STATES[line.state],
    team: hidden ? null : line.team,
    hidden,
    points: line.points?.wholePart() ?? null,
  };
}

/** R-82, R-101: a pick's game has tipped off or has a result. */
function isRevealed(line: LedgerRound, input: SurvivalSummaryInput): boolean {
  return (
    hasTippedOff(input.season, line.round, line.team, input.now) ||
    gamesOf(input.season, line.round, line.team).some(
      (game) => game.result !== null,
    )
  );
}
