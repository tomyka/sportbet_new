import { Points } from '../points/points';
import type { MatchPoints } from '../prediction/match-scoring';
import type { GameId, TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import type { Rate } from '../score/score';

/** What each later call of a run adds, times its rate (SE-3, #97). */
export const SERIJA_STEP = 10;

/** One scored game of the tournament, from one player's side. */
export interface SerijaGame {
  /** Runs never cross tournaments (SE-2, #122). */
  readonly tournament: TournamentId;
  readonly game: GameId;
  readonly tipOff: Instant;
  readonly rate: Rate;
  /** The player's points row for the game; null when there is none. */
  readonly points: MatchPoints | null;
}

export interface SerijaBonus {
  readonly game: GameId;
  readonly bonus: Points;
}

/**
 * SE-1 to SE-3: walk one player's games with a result, per tournament, by
 * tip-off then id. A real call that named the winner extends the run; a
 * fill-in, a wrong call or a game with no points row ends it. Each game
 * with a points row stores (run length - 1) x 10 x its rate; the player's
 * serija points are the sum.
 */
export function walkSerija(
  games: readonly SerijaGame[],
): readonly SerijaBonus[] {
  const ordered = [...games].sort(
    (a, b) =>
      a.tournament.localeCompare(b.tournament) ||
      a.tipOff - b.tipOff ||
      a.game - b.game,
  );
  const bonuses: SerijaBonus[] = [];
  const runs = new Map<TournamentId, number>();
  for (const entry of ordered) {
    if (entry.points === null) {
      runs.set(entry.tournament, 0);
      continue;
    }
    const run = entry.points.extendsSerija
      ? (runs.get(entry.tournament) ?? 0) + 1
      : 0;
    runs.set(entry.tournament, run);
    bonuses.push(
      Object.freeze({
        game: entry.game,
        bonus: Points.whole(Math.max(0, run - 1) * SERIJA_STEP).times(
          entry.rate.value,
        ),
      }),
    );
  }
  return Object.freeze(bonuses);
}
