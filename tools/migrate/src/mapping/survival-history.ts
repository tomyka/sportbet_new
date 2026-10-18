import { PerTournament } from './ledger';
import type { TeamId } from '@sportbet/domain';
import type { SurvivalPickRow } from './player-rows';
import type { SurvivalPointsRow } from './points';

// sportbet keeps `point_survivals` as the history of a run (one row per
// resolved round per player, kept forever; a 0 is the round the player was
// knocked out in) and `prediction_survivals` only as the live run: a loss
// nulls every event the player holds in that tournament
// (resetUserSurvivalSequence). The new `survival_picks` is the history (R-5),
// so a resolved round's pick the live table no longer holds is rebuilt here
// from the stored row that proves it. Nothing is judged: a pick set is stored
// as it was (one per player and round), as every stored value is.

/** What rebuilding the history did, counted for the report. */
export interface HistoryPicks {
  /** The live picks, then the rebuilt ones, per tournament. */
  readonly picks: PerTournament<SurvivalPickRow>;
  /** Picks rebuilt: a stored row whose round had no live pick. */
  readonly rebuilt: number;
  /** Rounds whose live pick names another team than the stored row: the live pick stays. */
  readonly keptLive: number;
  /** Rounds with several stored rows and no live pick: nothing is guessed. */
  readonly ambiguous: number;
}

const roundKey = (user: number, round: number): string =>
  `${String(user)}/${String(round)}`;

/** The loaded history rows of each player and round, in the order read. */
function historyOf(
  rows: readonly SurvivalPointsRow[],
): Map<string, SurvivalPointsRow[]> {
  const history = new Map<string, SurvivalPointsRow[]>();
  for (const row of rows) {
    const key = roundKey(row.user, row.row.round);
    history.set(key, [...(history.get(key) ?? []), row]);
  }
  return history;
}

type Decision =
  | { readonly kind: 'covered' | 'kept-live' | 'ambiguous' }
  | { readonly kind: 'rebuilt'; readonly row: SurvivalPickRow };

/** What one player's round of stored rows comes to, given the live pick's team. */
function decide(
  rows: readonly SurvivalPointsRow[],
  liveTeam: TeamId | undefined,
): Decision {
  const [first] = rows;
  if (first === undefined) return { kind: 'covered' };
  if (liveTeam !== undefined) {
    return rows.some(({ row }) => row.team !== liveTeam)
      ? { kind: 'kept-live' }
      : { kind: 'covered' };
  }
  if (rows.length > 1) return { kind: 'ambiguous' };
  return {
    kind: 'rebuilt',
    row: {
      user: first.user,
      pick: { round: first.row.round, team: first.row.team },
    },
  };
}

/**
 * The live picks plus a pick for every resolved round of the loaded
 * `point_survivals` rows that no live pick covers.
 */
export function withHistoryPicks(
  live: PerTournament<SurvivalPickRow>,
  points: PerTournament<SurvivalPointsRow>,
): HistoryPicks {
  const picks = new PerTournament<SurvivalPickRow>();
  const counts = { rebuilt: 0, 'kept-live': 0, ambiguous: 0, covered: 0 };
  for (const tournament of new Set([
    ...live.tournaments(),
    ...points.tournaments(),
  ])) {
    const livePicks = new Map(
      live
        .of(tournament)
        .map(({ user, pick }) => [roundKey(user, pick.round), pick.team]),
    );
    for (const row of live.of(tournament)) picks.add(tournament, row);
    for (const [key, rows] of historyOf(points.of(tournament))) {
      const decision = decide(rows, livePicks.get(key));
      counts[decision.kind] += 1;
      if (decision.kind === 'rebuilt') picks.add(tournament, decision.row);
    }
  }
  return {
    picks,
    rebuilt: counts.rebuilt,
    keptLive: counts['kept-live'],
    ambiguous: counts.ambiguous,
  };
}

/** The report's line: numbers only, no player. */
export function historyNotice(history: HistoryPicks): string {
  return `survival_picks: ${String(history.rebuilt)} past picks rebuilt from point_survivals (a resolved round keeps no live pick, R-5); ${String(history.keptLive)} rounds kept the live pick where the stored row names another team; ${String(history.ambiguous)} rounds not rebuilt, as point_survivals holds several rows for one player and round`;
}
