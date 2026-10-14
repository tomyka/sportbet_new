import type {
  PlayerId,
  RoundNumber,
  TeamId,
  Tournament,
} from '@sportbet/domain';
import type { RuleSet } from '@sportbet/domain';
import type { Executor } from '../client';
import {
  readLeagueTable,
  type LeagueTableReads,
} from '../dashboard/league-table';
import { loadRoundNames } from '../season/repository';
import { loadTeamNames } from '../team/repository';

/**
 * What every summary reads of a tournament under one rule set: the league
 * table with the season and standing it was built from, and the team and
 * round names. The listed players' rule (R-73, RA-4) is applied here once,
 * by `listedOnly`; the four summary loaders only pick from the view.
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
  rules: RuleSet,
): Promise<LeagueView> {
  const reads = await readLeagueTable(db, tournament, rules);
  const { listed } = reads.standing;
  return {
    ...reads,
    teamNames: await loadTeamNames(db, tournament),
    roundNames: await loadRoundNames(db, tournament),
    listedOnly: (items) => items.filter(({ player }) => listed.has(player)),
  };
}
