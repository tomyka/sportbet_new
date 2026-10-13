import type { MatchPoints } from '../prediction/match-scoring';
import type { Game } from '../round/game';

/**
 * PredictionVerdict::forResult, Euroleague's cases (decision 11: no
 * shoot-out, so no 'partial', which needs a recorded shoot-out winner).
 */
export type PredictionVerdict = 'ok' | 'fail' | 'pending';

/**
 * The badge on one prediction. Null: no prediction, no badge. A game with no
 * result (a postponed one has none, R-63) is pending. Winner points above 0
 * are ok, unless the round is a knockout and the prediction's ending (a draw
 * or not) is not the result's (sportbet's `endingOk`); everything else fails.
 */
export function predictionVerdict(input: {
  readonly game: Game;
  readonly knockout: boolean;
  readonly prediction: { readonly home: number; readonly away: number } | null;
  /** The rule set's row, null before scoring. */
  readonly points: Pick<MatchPoints, 'winner'> | null;
}): PredictionVerdict | null {
  const { game, knockout, prediction, points } = input;
  if (prediction === null) return null;
  if (game.result === null) return 'pending';
  const endingOk =
    (prediction.home === prediction.away) === game.result.isLevel();
  const paid = points?.winner.isPositive() === true;
  return paid && (!knockout || endingOk) ? 'ok' : 'fail';
}

export type StandingsVerdict = 'none' | 'pending' | 'hit' | 'miss' | 'partial';

type SettledVerdict = Exclude<StandingsVerdict, 'partial'>;

/** The standings summary's three verdicts, PredictionVerdict's `position`, `advanced` and `final`. */
export const standingsVerdict = {
  /** A table position: hit only on the exact place; null or 0 is not predicted. */
  position(predicted: number | null, actual: number | null): SettledVerdict {
    if (predicted === null || predicted === 0) return 'none';
    if (actual === null) return 'pending';
    return predicted === actual ? 'hit' : 'miss';
  },

  /** A stage tick: predicted to advance, and did; null is a stage not decided yet. */
  advanced(predicted: boolean, actual: boolean | null): SettledVerdict {
    if (!predicted) return 'none';
    if (actual === null) return 'pending';
    return actual ? 'hit' : 'miss';
  },

  /** The final place, judged against whether the team even reached the Final Four. */
  final(input: {
    readonly predictedFinal: number | null;
    readonly predictedFinalFour: boolean;
    readonly teamFinalFour: boolean | null;
    readonly teamFinal: number | null;
  }): StandingsVerdict {
    const { predictedFinal, predictedFinalFour, teamFinalFour, teamFinal } =
      input;
    if (predictedFinal === null || predictedFinal === 0) return 'none';
    // Out before the Final Four: this pick can never come true.
    if (teamFinalFour === false) return 'miss';
    if (teamFinal === null) return 'pending';
    if (predictedFinal === teamFinal) return 'hit';
    // The wrong slot, but the team was right to reach the Final Four.
    return predictedFinalFour ? 'partial' : 'miss';
  },
};
