import type {
  PlayerId,
  RoundNumber,
  TeamId,
  Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import {
  readLeagueTable,
  type LeagueTableReads,
} from '../dashboard/league-table';
import type { RosterScope } from '../league/roster';
import { loadRoundNames } from '../season/repository';
import { loadTeamNames } from '../team/repository';

/**
 * What every summary reads of a tournament under the live source: the league
 * table with the season and standing it was built from, and the team and
 * round names. The roster's rule (R-73: listed, and the viewer's league at
 * the viewer's level) is applied here once, by `listedOnly`; the summary
 * loaders only pick from the view.
 */
export interface LeagueView extends LeagueTableReads {
  readonly teamNames: ReadonlyMap<TeamId, string>;
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
  /** The items of the listed players, in their order. */
  readonly listedOnly: <T extends { readonly player: PlayerId }>(
    items: readonly T[],
  ) => T[];
}

export async function loadLeagueView(
  db: Executor,
  tournament: Tournament,
  scope: RosterScope,
): Promise<LeagueView> {
  const reads = await readLeagueTable(db, tournament, scope);
  const { listed } = reads.standing;
  return {
    ...reads,
    teamNames: await loadTeamNames(db, tournament),
    roundNames: await loadRoundNames(db, tournament),
    listedOnly: (items) => items.filter(({ player }) => listed.has(player)),
  };
}
