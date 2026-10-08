import type { Points } from '../points/points';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId, RoundNumber, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import {
  refoldStoredSurvival,
  type JoinedSurvivalRow,
} from '../survival/stored-survival';
import {
  foldSurvival,
  survivalAtResultEntry,
  type SurvivalRow,
} from '../survival/survival-fold';
import type { SurvivalRun } from '../survival/survival-run';

/**
 * One `point_survivals` row as stored: the round a player's pick was scored
 * in, the team it was scored for, and the running total it stored (0 is the
 * round that was lost).
 */
export interface StoredSurvivalRow {
  /** `point_survivals.id`: two rows may share a player and a round. */
  readonly id: number;
  readonly player: PlayerId;
  readonly round: RoundNumber;
  readonly team: TeamId;
  readonly storedPoints: Points;
}

/**
 * What survival is scored from: each player's pick history, or the rows a
 * tournament stored (sportbet's picks are no history: a re-pick moves a
 * team's pick, SU-5, and a loss detaches the run's picks, SU-9). Which one a rule set scores from is its own
 * (`survivalScoredFromStoredRows`); the caller passes whichever it holds.
 */
export type SurvivalSource =
  | {
      readonly from: 'picks';
      readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
    }
  | {
      readonly from: 'stored-rows';
      readonly rows: readonly StoredSurvivalRow[];
    };

/** A `point_survivals` row: one pick's stored running total. */
export interface SurvivalPoints {
  readonly player: PlayerId;
  readonly round: RoundNumber;
  readonly team: TeamId;
  /**
   * Null while the pick waits for its game (SU-8). sportbet stores no row
   * for such a pick, so a comparison with stored rows skips these.
   */
  readonly points: Points | null;
  /** A total an earlier, still pending pick will change (R-34). */
  readonly provisional: boolean;
  /** The stored row this rewrites; null when scored from the picks. */
  readonly storedId: number | null;
}

/** Why survival could not be scored from what the caller holds. */
export type SurvivalRefusal =
  | 'survival-scored-from-picks'
  | 'survival-row-in-unknown-round'
  | 'survival-row-id-twice'
  | 'survival-pick-in-unknown-round'
  | 'survival-pick-in-round-without-survival';

/** By tip-off, then id: the order a team's two games in a round are decided in. */
export function byTipOffThenId(a: Game, b: Game): number {
  return a.tipOff - b.tipOff || a.id - b.id;
}

/**
 * Survival under the rule set, from what the caller holds: each pick
 * history folded (ruled, R-5) or refolded as sportbet's result entries
 * stored it (picksSurvival), or the stored rows refolded (SU-10,
 * storedSurvival). Internal to recalculateTournament.
 */
export function survivalPoints(
  source: SurvivalSource,
  season: Season,
  rules: RuleSet,
): Result<readonly SurvivalPoints[], SurvivalRefusal> {
  return source.from === 'picks'
    ? picksSurvival(source.runs, season, rules)
    : storedSurvival(source.rows, season, rules);
}

/** A pick outside a round of the season that carries survival (SU-7). */
function pickRoundRefusal(
  run: SurvivalRun,
  season: Season,
): SurvivalRefusal | null {
  for (const pick of run.picks) {
    const round = season.round(pick.round);
    if (round === undefined) return 'survival-pick-in-unknown-round';
    if (!round.survival) return 'survival-pick-in-round-without-survival';
  }
  return null;
}

/**
 * Each pick history scored: folded against the results (ruled, R-5), or -
 * under a set that scores from stored rows - the rows sportbet's result
 * entries stored, refolded (refoldAtEntry).
 */
function picksSurvival(
  runs: ReadonlyMap<PlayerId, SurvivalRun>,
  season: Season,
  rules: RuleSet,
): Result<readonly SurvivalPoints[], SurvivalRefusal> {
  // A team with two games in a round is decided and paid by the earlier.
  const games = [...season.games].sort(byTipOffThenId);
  const rows: SurvivalPoints[] = [];
  for (const [player, run] of runs) {
    const refusal = pickRoundRefusal(run, season);
    if (refusal !== null) return refuse(refusal);
    const scored = rules.survivalScoredFromStoredRows
      ? refoldAtEntry(
          player,
          survivalAtResultEntry(run.picks, games),
          season,
          rules,
        )
      : foldSurvival(run.picks, games).map((row) =>
          Object.freeze({
            player,
            round: row.round,
            team: row.team,
            points: row.points,
            provisional: row.provisional,
            storedId: null,
          }),
        );
    rows.push(...scored);
  }
  return ok(Object.freeze(rows));
}

/**
 * The stored rows refolded (SU-10), under a set that scores from them:
 * each id once, each in a round of the season, by round then id (sportbet
 * orders by event_day and leaves the rows within a round unordered, so the
 * id decides); listed by player, then round.
 */
function storedSurvival(
  stored: readonly StoredSurvivalRow[],
  season: Season,
  rules: RuleSet,
): Result<readonly SurvivalPoints[], SurvivalRefusal> {
  if (!rules.survivalScoredFromStoredRows) {
    return refuse('survival-scored-from-picks');
  }
  if (new Set(stored.map((row) => row.id)).size !== stored.length) {
    return refuse('survival-row-id-twice');
  }
  if (stored.some((row) => season.round(row.round) === undefined)) {
    return refuse('survival-row-in-unknown-round');
  }
  const ordered = [...stored].sort((a, b) => a.round - b.round || a.id - b.id);
  const refolded = refold(ordered, season, rules);
  const rows = ordered
    .map((row) =>
      Object.freeze({
        player: row.player,
        round: row.round,
        team: row.team,
        points: refolded.get(row.id) ?? null,
        provisional: false,
        storedId: row.id,
      }),
    )
    .sort(byPlayerThenRound(stored.map((row) => row.player)));
  return ok(Object.freeze(rows));
}

/**
 * sportbet's two survival passes in turn, from one player's pick history:
 * the rows its result entries stored (a pending pick stores none yet), then
 * the full recalculation's refold of them (SU-10).
 */
function refoldAtEntry(
  player: PlayerId,
  atEntry: readonly SurvivalRow[],
  season: Season,
  rules: RuleSet,
): readonly SurvivalPoints[] {
  const stored = atEntry.flatMap((row, index) =>
    row.points === null
      ? []
      : [
          {
            id: index,
            player,
            round: row.round,
            team: row.team,
            storedPoints: row.points,
          },
        ],
  );
  const refolded = refold(stored, season, rules);
  return atEntry.map((row, index) =>
    Object.freeze({
      player,
      round: row.round,
      team: row.team,
      points: refolded.get(index) ?? null,
      provisional: false,
      storedId: null,
    }),
  );
}

/** SU-10's refold, each row joined with its team's game in its round. */
function refold(
  rows: readonly StoredSurvivalRow[],
  season: Season,
  rules: RuleSet,
): ReadonlyMap<number, Points> {
  const games = [...season.games].sort(byTipOffThenId);
  const joined: JoinedSurvivalRow[] = rows.map((row) => ({
    ...row,
    awayTeam:
      games.find((game) => game.round === row.round && game.plays(row.team))
        ?.away ?? null,
  }));
  const refolded = refoldStoredSurvival(joined, rules);
  if (!refolded.ok) {
    // Ids are unique and each row joins one game, so no id has two rows.
    throw new Error(`recalculateTournament: ${refolded.refusal}`);
  }
  return new Map(refolded.value.map((row) => [row.id, row.points]));
}

function byPlayerThenRound(
  order: readonly PlayerId[],
): (a: SurvivalPoints, b: SurvivalPoints) => number {
  const position = new Map<PlayerId, number>();
  for (const player of order) {
    if (!position.has(player)) position.set(player, position.size);
  }
  return (a, b) =>
    (position.get(a.player) ?? 0) - (position.get(b.player) ?? 0) ||
    a.round - b.round;
}
