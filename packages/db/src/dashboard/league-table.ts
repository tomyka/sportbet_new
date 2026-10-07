import {
  leagueTableRows,
  tallyMedals,
  type LeagueTableRow,
  type MedalRow,
  type RuleSet,
  type Season,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadFinalPlaces } from '../hub/repository';
import { loadSeason } from '../season/repository';
import {
  loadListed,
  loadTournamentStanding,
  type TournamentStanding,
} from './standing';

export type { LeagueTableRow, StageCents } from '@sportbet/domain';

export interface LeagueTable {
  readonly rows: readonly LeagueTableRow[];
  /** The tournament plays survival: the column is drawn only then. */
  readonly survival: boolean;
}

/** What the league table was built from, for the game page to reuse. */
export interface LeagueTableReads {
  readonly table: LeagueTable;
  readonly season: Season;
  readonly standing: TournamentStanding;
}

/**
 * MedalTally::forTournament over the tournament's listed players (R-73):
 * how many put each team first to fourth (tallyMedals). No gate on the
 * first tip-off: the tournament page draws it whenever it has a line; the
 * game page waits for the first game itself.
 */
export async function loadLeagueMedals(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<readonly MedalRow[]> {
  const listed = await loadListed(db, tournament, rules);
  return tallyMedals(
    (await loadFinalPlaces(db, tournament)).filter(({ player }) =>
      listed.has(player),
    ),
  );
}

/**
 * The league table and what it was read from. It only loads - the season
 * and the tournament's standing (loadTournamentStanding) - and asks the
 * domain for the rows (leagueTableRows).
 */
export async function readLeagueTable(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<LeagueTableReads> {
  const season = await loadSeason(db, tournament);
  const standing = await loadTournamentStanding(db, tournament, rules);
  const table: LeagueTable = {
    survival: tournament.survival,
    rows: leagueTableRows({
      season,
      rows: standing.rows,
      totals: standing.totals,
      listed: standing.listed,
      usernames: standing.usernames,
      rules,
    }),
  };
  return { table, season, standing };
}

/**
 * PointController::getAllUserPoints and getAllUsersGameHistory over the
 * tournament's listed players (R-73): the game page's "Taškų lentelė" and
 * the tournament page's league table.
 */
export async function loadLeagueTable(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<LeagueTable> {
  return (await readLeagueTable(db, tournament, rules)).table;
}
