import {
  earnedPointsOf,
  leagueHistory,
  rankPlayers,
  StandingsPoints,
  tallyMedals,
  type HistoryEntry,
  type MedalRow,
  type PlayerId,
  type PointsRows,
  type RuleSet,
  type Season,
  type StandingsLine,
  type StandingsRow,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { keyOfTournament } from '../edge';
import { loadFinalPlaces, loadUsernames } from '../hub/repository';
import { loadPlayerStatuses } from '../player/repository';
import { loadTournamentTotals } from '../points/totals';
import { loadSeason } from '../season/repository';

/** A player's standings points by stage, to the cent: the popover's lines. */
export interface StageCents {
  /** The table places ("Reguliarus sezonas"). */
  readonly place: number;
  /** The play-off ticks ("Atkrintamosios"). */
  readonly playOffs: number;
  /** The Final Four ticks ("Finalo ketvertas"). */
  readonly finalFour: number;
  /** The final places ("Finalas"). */
  readonly final: number;
}

export interface LeagueTableRow {
  readonly player: PlayerId;
  readonly username: string;
  readonly rank: number;
  /** The total the table ranks by (R-18, R-31), to the cent. */
  readonly totalCents: number;
  readonly matchCents: number;
  readonly serijaCents: number;
  readonly standingsCents: number;
  readonly survivalCents: number;
  /** The rows with bingo points ("Bingo taškai"). */
  readonly bingo: number;
  /** Each stage's sum over the player's standings rows; sportbet draws those above 0. */
  readonly stages: StageCents;
  /** The rank after every scored game, oldest first (leagueHistory). */
  readonly history: readonly HistoryEntry[];
}

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

/** One stage's lines summed in ten-thousandths, then rounded once. */
function stageCents(
  rows: readonly StandingsRow[],
  line: (row: StandingsRow) => StandingsLine,
): number {
  return rows
    .reduce(
      (sum, row) => sum.plus(line(row).points ?? StandingsPoints.ZERO),
      StandingsPoints.ZERO,
    )
    .toCents();
}

/** The tournament's listed players (RA-4; R-7, R-19): its league until leagues arrive (R-73). */
async function loadListed(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<ReadonlySet<PlayerId>> {
  const statuses = await loadPlayerStatuses(db, tournament, rules);
  const key = keyOfTournament(tournament);
  return new Set(
    [...statuses].flatMap(([player, status]) =>
      status.isListedIn(key, rules) ? [player] : [],
    ),
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
 * The league table and what it was read from: the tournament's listed
 * players (R-73; RA-4, R-7), their stored totals under the rule set
 * (loadTournamentTotals, each listed player with zero if they have no
 * row), ranked (rankPlayers, 'league-table'), each with its parts, its
 * stage sums and its history (earnedPointsOf, leagueHistory).
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
  const nameOf = (player: PlayerId): string => {
    const name = usernames.get(player);
    if (name === undefined) {
      throw new Error('readLeagueTable: a listed player has no username');
    }
    return name;
  };
  const ranked = rankPlayers(
    totals.flatMap((total) =>
      listed.has(total.player)
        ? [{ ...total, username: nameOf(total.player), listed: true }]
        : [],
    ),
    'league-table',
    rules,
  );
  const history = leagueHistory({
    season,
    earned: earnedPointsOf(season, rows),
    listed,
    rules,
  });
  const byPlayer = new Map(totals.map((total) => [total.player, total]));
  const table: LeagueTable = {
    survival: tournament.survival,
    rows: ranked.map((row) => {
      const total = byPlayer.get(row.player);
      if (total === undefined) {
        throw new Error('readLeagueTable: a ranked player without a total');
      }
      const standings = rows.standings.filter(
        ({ player }) => player === row.player,
      );
      return {
        player: row.player,
        username: row.username,
        rank: row.rank,
        totalCents: row.totalCents,
        matchCents: total.match.hundredths,
        serijaCents: total.serija.hundredths,
        standingsCents: total.standings.toCents(),
        survivalCents: total.survival.hundredths,
        bingo: rows.matches.filter(
          ({ player, points }) =>
            player === row.player && points.bingo.hundredths !== 0,
        ).length,
        stages: {
          place: stageCents(standings, ({ place }) => place),
          playOffs: stageCents(standings, ({ playOffs }) => playOffs),
          finalFour: stageCents(standings, ({ finalFour }) => finalFour),
          final: stageCents(standings, ({ final }) => final),
        },
        history: history.get(row.player) ?? [],
      };
    }),
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
