import { pointsWhole, type Points } from '../points/points';
import type { PredictionOrigin } from '../prediction/match-prediction';
import type { MatchPoints } from '../prediction/match-scoring';
import type { Season } from '../round/season';
import type { GameId } from '../shared/ids';

/** What each later call of a run adds, times its rate (SE-3, #97). */
export const SERIJA_STEP = 10;

/**
 * SerijaCorrectness::isFullyCorrect, the one rule for what extends a run
 * (SE-1): not a fill-in, and winner points above 0. A points row with no
 * prediction behind it counts, as sportbet reads a missing `generated` as
 * not generated. sportbet also refuses a knockout call that named the team
 * by the wrong route; a Euroleague result is never level (R-38), so a
 * stored row never holds one, and scoreMatch checks the route itself
 * (extendsSerija). The serija walk reads extendsSerija; the "serija" tile
 * and the leaderboard's "Nugalėtojai" read stored rows through this.
 */
export function isFullyCorrect(
  winner: Points,
  origin: PredictionOrigin | null,
): boolean {
  return (
    origin !== 'fill-in' && origin !== 'late-fill-in' && winner.isPositive()
  );
}

export interface SerijaBonus {
  readonly game: GameId;
  readonly bonus: Points;
}

/**
 * SE-1 to SE-3: walk one player's games of one tournament that have a
 * result, by tip-off then id. A real call that named the winner extends
 * the run; a fill-in, a wrong call or a game with no points row ends it.
 * Each game with a points row stores (run length - 1) x 10 x its round's
 * rate; the player's serija points are the sum. Runs never cross
 * tournaments (SE-2, #122): a season is one tournament.
 *
 * Internal to the recalculation (recalculateTournament), whose tests cover
 * it: `pointsAt` is the player's points row for a game, null for none.
 */
export function walkSerija(
  season: Season,
  pointsAt: (game: GameId) => MatchPoints | null,
): readonly SerijaBonus[] {
  const ordered = season.games
    .filter((game) => game.result !== null)
    .sort((a, b) => a.tipOff - b.tipOff || a.id - b.id);
  const bonuses: SerijaBonus[] = [];
  let run = 0;
  for (const game of ordered) {
    const points = pointsAt(game.id);
    if (points === null) {
      run = 0;
      continue;
    }
    run = points.extendsSerija ? run + 1 : 0;
    const rate = season.round(game.round)?.rate.value;
    if (rate === undefined) {
      throw new Error('walkSerija: a game outside its season');
    }
    bonuses.push(
      Object.freeze({
        game: game.id,
        bonus: pointsWhole(Math.max(0, run - 1) * SERIJA_STEP).times(rate),
      }),
    );
  }
  return Object.freeze(bonuses);
}
