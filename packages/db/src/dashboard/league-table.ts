import {
  leagueTableRows,
  listedPlayers,
  tallyMedals,
  type LeagueTableRow,
  type MedalRow,
  type PlayerId,
  type PointsRows,
  type RuleSet,
  type Season,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { keyOfTournament } from '../edge';
import { loadFinalPlaces, loadUsernames } from '../hub/repository';
import { loadPlayerStatuses } from '../player/repository';
import { loadTournamentTotals } from '../points/totals';
import { loadSeason } from '../season/repository';

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
  readonly rows: PointsRows;
  readonly listed: ReadonlySet<PlayerId>;
  readonly usernames: ReadonlyMap<PlayerId, string>;
}

/** The tournament's listed players (listedPlayers): its league until leagues arrive (R-73). */
export async function loadListed(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<ReadonlySet<PlayerId>> {
  return listedPlayers(
    await loadPlayerStatuses(db, tournament, rules),
    keyOfTournament(tournament),
    rules,
  );
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
 * The league table and what it was read from. It only loads - the season,
 * the listed players, their stored totals under the rule set
 * (loadTournamentTotals, each listed player with zero if they have no row)
 * and their usernames - and asks the domain for the rows (leagueTableRows).
 */
export async function readLeagueTable(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<LeagueTableReads> {
  const season = await loadSeason(db, tournament);
  const listed = await loadListed(db, tournament, rules);
  const { totals, rows } = await loadTournamentTotals(db, tournament, rules, [
    ...listed,
  ]);
  const usernames = await loadUsernames(db, [...listed]);
  const table: LeagueTable = {
    survival: tournament.survival,
    rows: leagueTableRows({ season, rows, totals, listed, usernames, rules }),
  };
  return { table, season, rows, listed, usernames };
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
