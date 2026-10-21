import { Points, pointsWhole } from '../points/points';
import type { Game } from '../round/game';
import type { RoundNumber, TeamId } from '../shared/ids';

/**
 * What a surviving round pays, by where the team won (SU-1, #178), before the
 * multiplier (R-138): use `survivalGroundPays` for what is stored.
 */
const SURVIVAL_POINTS = Object.freeze({ homeWin: 10, awayWin: 12 });

/** SU-1, R-138: what each surviving round pays is multiplied by this. */
const SURVIVAL_MULTIPLIER = 2;

/**
 * SU-1, R-138: what a win on `ground` pays, 12 away and 10 at home times
 * SURVIVAL_MULTIPLIER; the page's stake and table too.
 */
export function survivalGroundPays(ground: 'home' | 'away'): number {
  const base =
    ground === 'away' ? SURVIVAL_POINTS.awayWin : SURVIVAL_POINTS.homeWin;
  return base * SURVIVAL_MULTIPLIER;
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
type SurvivalState = 'survived' | 'lost' | 'pending';

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
  // A team with two games in a round is decided and paid by the earlier.
  const [game] = games
    .filter((each) => each.round === pick.round && each.plays(pick.team))
    .sort((a, b) => a.tipOff - b.tipOff || a.id - b.id);
  const winner = game?.winner() ?? null;
  if (game === undefined || winner === null) {
    return { state: 'pending' };
  }
  if (winner !== pick.team) {
    return { state: 'lost' };
  }
  return {
    state: 'survived',
    pays: survivalGroundPays(game.away === pick.team ? 'away' : 'home'),
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
 * This is the one computation of survival, from the pick history (R-5):
 * recalculation stores its rows, and the survival page and summary show it.
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
