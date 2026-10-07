import type { Instant, RuleSet } from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTournaments } from '../tournament/repository';
import { lockTournamentForRecalculation } from './lock';
import { recalculateUnderRuleSet } from './repository';

/** One tournament recalculated, and how long it took. */
export interface Recalculated {
  readonly tournament: string;
  readonly ms: number;
}

/**
 * Recalculation::all for R-65's one button: every tournament that may be
 * recalculated at `now` (Season.mayRecalculateAt - a finished one is
 * frozen under the ruled set, R-22), each through recalculateUnderRuleSet
 * (match points, serija, survival and standings: no separate "Eigos
 * taškai"), timed with `timer` (milliseconds). No fill-in is made and no
 * stored odds read (CO-7). A refusal is an inconsistent database: it
 * throws, and the tournaments before it stay recalculated. By tournament
 * id, each in its own transaction under its recalculation lock
 * (lockTournamentForRecalculation), so a result written meanwhile is
 * recalculated whole, before or after.
 */
export async function recalculateAll(
  db: Executor,
  input: {
    readonly now: Instant;
    readonly rules: RuleSet;
    readonly timer: () => number;
  },
): Promise<Recalculated[]> {
  const { now, rules, timer } = input;
  const done: Recalculated[] = [];
  const byId = (await listTournaments(db)).sort((a, b) => a.id - b.id);
  for (const tournament of byId) {
    const ms = await db.transaction(async (tx): Promise<number | null> => {
      await lockTournamentForRecalculation(tx, tournament.id);
      const season = await loadSeason(tx, tournament);
      if (!season.mayRecalculateAt(now, rules)) return null;
      const started = timer();
      const refusal = await recalculateUnderRuleSet(tx, tournament, rules);
      if (refusal !== null) {
        throw new Error(
          `recalculateAll: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
        );
      }
      return timer() - started;
    });
    if (ms !== null) done.push({ tournament: tournament.slug, ms });
  }
  return done;
}
