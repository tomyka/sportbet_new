import type { Points } from '../points/points';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { PlayerId, RoundNumber, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { foldSurvival } from '../survival/survival-fold';
import type { SurvivalRun } from '../survival/survival-run';

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
}

/** Why survival could not be scored from what the caller holds. */
export type SurvivalRefusal =
  'survival-pick-in-unknown-round' | 'survival-pick-in-round-without-survival';

/** By tip-off, then id: the order a team's two games in a round are decided in. */
export function byTipOffThenId(a: Game, b: Game): number {
  return a.tipOff - b.tipOff || a.id - b.id;
}

/**
 * Survival from each player's pick history folded against the results (R-5).
 * Internal to recalculateTournament.
 */
export function survivalPoints(
  runs: ReadonlyMap<PlayerId, SurvivalRun>,
  season: Season,
): Result<readonly SurvivalPoints[], SurvivalRefusal> {
  // A team with two games in a round is decided and paid by the earlier.
  const games = [...season.games].sort(byTipOffThenId);
  const rows: SurvivalPoints[] = [];
  for (const [player, run] of runs) {
    const refusal = pickRoundRefusal(run, season);
    if (refusal !== null) return refuse(refusal);
    rows.push(
      ...foldSurvival(run.picks, games).map((row) =>
        Object.freeze({
          player,
          round: row.round,
          team: row.team,
          points: row.points,
          provisional: row.provisional,
        }),
      ),
    );
  }
  return ok(Object.freeze(rows));
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
