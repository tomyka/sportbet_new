import { Points, pointsWhole } from '../points/points';
import type { Game } from '../round/game';
import type { RoundNumber, TeamId } from '../shared/ids';

/** What a surviving round pays, by where the team won (SU-1, #178). */
export const SURVIVAL_POINTS = Object.freeze({ homeWin: 10, awayWin: 12 });

/**
 * SU-1: what a surviving round pays `team`, given its game's away side:
 * 12 away, 10 at home (and, in the stored refold, 10 with no game).
 */
export function survivalPays(awayTeam: TeamId | null, team: TeamId): number {
  return awayTeam === team ? SURVIVAL_POINTS.awayWin : SURVIVAL_POINTS.homeWin;
}

/** One round's survival pick. */
export interface SurvivalPick {
  readonly round: RoundNumber;
  readonly team: TeamId;
}

/**
 * survived: the team won; lost: it lost; pending: its game has not been
 * decided (not played, postponed, or a level result sportbet stored until
 * sportbet#274).
 */
export type SurvivalState = 'survived' | 'lost' | 'pending';

/** What a round's pick stores (SU-2): the run's total so far. */
export interface SurvivalRow {
  readonly round: RoundNumber;
  readonly team: TeamId;
  readonly state: SurvivalState;
  /** The stored running total; null while pending (no row yet). */
  readonly points: Points | null;
  /**
   * An earlier pick of the run is still pending, so this total will be
   * recomputed when it is decided (R-34).
   */
  readonly provisional: boolean;
}

type Decision =
  | { readonly state: 'pending' }
  | { readonly state: 'lost' }
  | { readonly state: 'survived'; readonly pays: number };

function decide(pick: SurvivalPick, games: readonly Game[]): Decision {
  const game = games.find(
    (each) => each.round === pick.round && each.plays(pick.team),
  );
  const winner = game?.winner() ?? null;
  if (game === undefined || winner === null) {
    return { state: 'pending' };
  }
  if (winner !== pick.team) {
    return { state: 'lost' };
  }
  return {
    state: 'survived',
    pays: survivalPays(game.away, pick.team),
  };
}

/**
 * The folds below are not exported from the package: callers reach them
 * through SurvivalRun, whose `stored` refuses two picks in one round, so a
 * second pick here is a programmer error, not input to refuse.
 */
function inRoundOrder(picks: readonly SurvivalPick[]): SurvivalPick[] {
  const ordered = [...picks].sort((a, b) => a.round - b.round);
  if (new Set(ordered.map((pick) => pick.round)).size !== ordered.length) {
    throw new Error('survival: a run holds one pick per round');
  }
  return ordered;
}

/**
 * One player's picks in one tournament, folded in round order (R-34): each
 * surviving round stores the run's running total (SU-2), a loss stores 0
 * and ends the run (SU-3), a round without a pick changes nothing (SU-6,
 * R-33), and a pending pick stores nothing yet and makes the totals after
 * it provisional until it is decided (SU-8, R-12, R-34). While it waits it
 * adds nothing but the run goes on, so the rounds after it carry the total
 * from before it; if it is then lost the run ends there and those rounds
 * start a new one without that total (round 7 home 10, round 8 pending,
 * round 9 home: provisional 20; after a round-8 loss, 10).
 *
 * This is the ruled set's one computation from the pick history (R-5). It
 * is not sportbet's full recalculation: that refolds the stored rows and
 * never reads a result or a pick (refoldStoredSurvival, SU-10), so a stored
 * 0 from a mistaken result stays 0 there and a re-picked team is repaid
 * from the round's stored team. The two agree only while every stored row
 * matches the pick history and the results.
 */
export function foldSurvival(
  picks: readonly SurvivalPick[],
  games: readonly Game[],
): readonly SurvivalRow[] {
  const rows: SurvivalRow[] = [];
  let running = 0;
  let waiting = false;
  for (const pick of inRoundOrder(picks)) {
    const decision = decide(pick, games);
    switch (decision.state) {
      case 'pending':
        rows.push(
          Object.freeze({
            ...pick,
            state: 'pending',
            points: null,
            provisional: false,
          }),
        );
        waiting = true;
        break;
      case 'lost':
        rows.push(
          Object.freeze({
            ...pick,
            state: 'lost',
            points: Points.ZERO,
            provisional: false,
          }),
        );
        running = 0;
        waiting = false;
        break;
      case 'survived':
        running += decision.pays;
        rows.push(
          Object.freeze({
            ...pick,
            state: 'survived',
            points: pointsWhole(running),
            provisional: waiting,
          }),
        );
        break;
    }
  }
  return Object.freeze(rows);
}

/**
 * SU-5, SU-10: what sportbet stored at each result entry, rounds decided in
 * order. The row is the sum of the player's attached picks that won; a loss
 * detaches them all and stores 0; and re-picking a team moves its earlier
 * pick to the new round, so the earlier round keeps the total it stored
 * but drops out of later ones. sportbet only: the ruled set refuses the
 * re-pick (R-11) and has the one fold above.
 */
export function survivalAtResultEntry(
  picks: readonly SurvivalPick[],
  games: readonly Game[],
): readonly SurvivalRow[] {
  const rows: SurvivalRow[] = [];
  const attached = new Map<TeamId, number>();
  for (const pick of inRoundOrder(picks)) {
    attached.set(pick.team, 0);
    const decision = decide(pick, games);
    switch (decision.state) {
      case 'pending':
        rows.push(
          Object.freeze({
            ...pick,
            state: 'pending',
            points: null,
            provisional: false,
          }),
        );
        break;
      case 'lost':
        attached.clear();
        rows.push(
          Object.freeze({
            ...pick,
            state: 'lost',
            points: Points.ZERO,
            provisional: false,
          }),
        );
        break;
      case 'survived': {
        attached.set(pick.team, decision.pays);
        const total = [...attached.values()].reduce(
          (sum, pays) => sum + pays,
          0,
        );
        rows.push(
          Object.freeze({
            ...pick,
            state: 'survived',
            points: pointsWhole(total),
            provisional: false,
          }),
        );
        break;
      }
    }
  }
  return Object.freeze(rows);
}
