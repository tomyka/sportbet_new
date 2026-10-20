import type { Instant } from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTournaments } from '../tournament/repository';
import { lockTournamentForRecalculation } from './lock';
import { recalculateAndSave } from './repository';

/** One tournament recalculated, and how long it took. */
export interface Recalculated {
  readonly tournament: string;
  readonly ms: number;
}

/**
 * Recalculation::all for R-65's one button: every tournament that may be
 * recalculated at `now` (Season.mayRecalculateAt - a finished one is
 * frozen, R-22), each through recalculateAndSave
 * (match points, serija, survival and standings: no separate "Eigos
 * taškai"), timed with `timer` (milliseconds). No fill-in is made and no
 * stored odds read (CO-7). An inconsistent database throws (recalculateAndSave),
 * and the tournaments before it stay recalculated. By tournament
 * id, each in its own transaction under its recalculation lock
 * (lockTournamentForRecalculation), so a result written meanwhile is
 * recalculated whole, before or after.
 */
export async function recalculateAll(
  db: Executor,
  input: {
    readonly now: Instant;
    readonly timer: () => number;
  },
): Promise<Recalculated[]> {
  const { now, timer } = input;
  const done: Recalculated[] = [];
  const byId = (await listTournaments(db)).sort((a, b) => a.id - b.id);
  for (const tournament of byId) {
    const ms = await db.transaction(async (tx): Promise<number | null> => {
      const lock = await lockTournamentForRecalculation(tx, tournament);
      const season = await loadSeason(tx, tournament);
      if (!season.mayRecalculateAt(now)) return null;
      const started = timer();
      await recalculateAndSave(lock);
      return timer() - started;
    });
    if (ms !== null) done.push({ tournament: tournament.slug, ms });
  }
  return done;
}
