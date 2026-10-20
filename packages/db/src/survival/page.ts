import {
  survivalPickPage,
  type SurvivalPickPage,
  type TeamId,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadPlayerSurvivalRows } from '../points/repository';
import { loadRoundNames, loadSeason } from '../season/repository';
import { loadTeamNames } from '../team/repository';
import { loadSurvivalRun } from './repository';
import type { SurvivalRequest } from './request';

/** The survival page as the domain decided it, with the names it shows. */
export interface SurvivalPickPageData {
  readonly page: SurvivalPickPage;
  readonly teamNames: ReadonlyMap<TeamId, string>;
  /** The round's stored name (empty when unnamed); null when the page is over. */
  readonly roundName: string | null;
}

/**
 * PredictionSurvivalController::getPredictionSurvivalUser: the season, the
 * tournament's teams, its survival switch, the player's own picks and
 * their survival rows of the rule set's source, decided by
 * survivalPickPage. Unlocked: a page reads, a save locks its own.
 */
export async function loadSurvivalPickPage(
  db: Executor,
  load: SurvivalRequest,
): Promise<SurvivalPickPageData> {
  const { player, tournament, rules, now } = load;
  const teamNames = await loadTeamNames(db, tournament);
  const page = survivalPickPage({
    season: await loadSeason(db, tournament),
    teams: [...teamNames.keys()],
    survivalPlayed: tournament.survival,
    run: await loadSurvivalRun(db, tournament, player),
    rows: await loadPlayerSurvivalRows(db, tournament, rules.name, player),
    now,
  });
  const roundName =
    page.kind === 'open'
      ? ((await loadRoundNames(db, tournament)).get(page.round) ?? null)
      : null;
  return {
    page,
    teamNames,
    roundName,
  };
}
