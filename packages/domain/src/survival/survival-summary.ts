import { Points } from '../points/points';
import { tieOrderOf } from '../ranking/league-table';
import type { TournamentTotal } from '../recalculation/recalculation';
import type { SurvivalPoints } from '../recalculation/survival-points';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { survivalLedger, type LedgerRound } from './survival-ledger';
import { gamesOf, playsSurvival, SurvivalRun } from './survival-run';

/** One round's tile on the survival summary. */
export interface SummaryTile {
  readonly round: RoundNumber;
  readonly state: 'hit' | 'miss' | 'pending' | 'none';
  /** Null for none, and for a pick hidden from this viewer (R-82). */
  readonly team: TeamId | null;
  /** "Pasirinkta": another player's pick before its game tips off (R-82, R-101). */
  readonly hidden: boolean;
  readonly points: Points | null;
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
  /** "Iš eilės": SurvivalSummary::trailingHits. */
  readonly streak: number;
  /** The player's stored survival total (TournamentTotal.survival). */
  readonly total: Points;
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
  readonly rules: RuleSet;
  readonly now: Instant;
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
 * page's tie order on usernames (R-30).
 */
export function survivalSummary(input: SurvivalSummaryInput): SurvivalSummary {
  const rounds = summaryRounds(input.season, input.now, input.rules);
  const unranked = input.players.map((listed) => rowOf(listed, rounds, input));
  const byName = tieOrderOf('survival-summary', input.rules);
  const rows = unranked
    .sort(
      (a, b) =>
        b.total.hundredths - a.total.hundredths ||
        b.streak - a.streak ||
        byName(a.username, b.username),
    )
    .map((line, index) => ({ ...line, rank: index + 1 }));
  return { rounds, rows };
}

/** R-84: the survival rounds numbered up to the current one, or all of them. */
function summaryRounds(
  season: Season,
  now: Instant,
  rules: RuleSet,
): readonly RoundNumber[] {
  const current = season.currentRound(now, rules);
  return season.rounds
    .map((round) => round.number)
    .filter(
      (round) =>
        playsSurvival(round, { season, survivalPlayed: true }, rules) &&
        (current === null || round <= current),
    )
    .sort((a, b) => a - b);
}

function rowOf(
  listed: SummaryPlayer,
  rounds: readonly RoundNumber[],
  input: SurvivalSummaryInput,
): Omit<SummaryRow, 'rank'> {
  const ledger = survivalLedger(
    input.runs.get(listed.player) ?? SurvivalRun.EMPTY,
    input.rows.filter((row) => row.player === listed.player),
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
  return {
    player: listed.player,
    username: listed.username,
    initials: listed.initials,
    me,
    tiles,
    streak: trailingHits(tiles),
    total:
      input.totals.find((total) => total.player === listed.player)?.survival ??
      Points.ZERO,
    provisional: shown.some((line) => line.provisional),
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
    points: line.points,
  };
}

/** R-82, R-101: a pick's game has tipped off or has a result. */
function isRevealed(line: LedgerRound, input: SurvivalSummaryInput): boolean {
  return gamesOf(input.season, line.round, line.team).some(
    (game) => game.hasTippedOffAt(input.now) || game.result !== null,
  );
}

/**
 * SurvivalSummary::trailingHits: the survived rounds at the end, a pending
 * or an empty round skipped, a miss stopping the count.
 */
function trailingHits(tiles: readonly SummaryTile[]): number {
  let streak = 0;
  for (const tile of [...tiles].reverse()) {
    if (tile.state === 'miss') break;
    if (tile.state === 'hit') streak++;
  }
  return streak;
}
