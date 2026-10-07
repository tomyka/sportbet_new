import { StandingsPoints } from '../points/standings-points';
import { countsAsBingo } from '../prediction/match-scoring';
import { rankPlayers } from '../ranking/league-table';
import type {
  PointsRows,
  TournamentTotal,
} from '../recalculation/recalculation';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId } from '../shared/ids';
import type {
  StandingsLine,
  StandingsRow,
} from '../standings/standings-scoring';
import { earnedPointsOf } from './earned-points';
import { leagueHistory, type HistoryEntry } from './league-history';

/** A player's standings points by stage, to the cent: the popover's lines (R-76). */
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
  /** The rows that count as a bingo ("Bingo taškai", countsAsBingo). */
  readonly bingo: number;
  /** Each stage's sum over the player's standings rows; sportbet draws those above 0. */
  readonly stages: StageCents;
  /** The rank after every scored game, oldest first (leagueHistory). */
  readonly history: readonly HistoryEntry[];
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

/**
 * PointController::getAllUserPoints and getAllUsersGameHistory: the
 * tournament's listed players (R-73; RA-4, R-7) ranked by their totals
 * (rankPlayers, 'league-table'), each with its parts, its stage sums and
 * its history (earnedPointsOf, leagueHistory). `totals` holds a total for
 * every listed player, zero without a row (sumTournamentTotals).
 */
export function leagueTableRows(input: {
  readonly season: Season;
  readonly rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'>;
  readonly totals: readonly TournamentTotal[];
  readonly listed: ReadonlySet<PlayerId>;
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly rules: RuleSet;
}): readonly LeagueTableRow[] {
  const { season, rows, totals, listed, usernames, rules } = input;
  const nameOf = (player: PlayerId): string => {
    const name = usernames.get(player);
    if (name === undefined) {
      throw new Error('leagueTableRows: a listed player has no username');
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
  return Object.freeze(
    ranked.map((row) => {
      const total = byPlayer.get(row.player);
      if (total === undefined) {
        throw new Error('leagueTableRows: a ranked player without a total');
      }
      const standings = rows.standings.filter(
        ({ player }) => player === row.player,
      );
      return Object.freeze({
        player: row.player,
        username: row.username,
        rank: row.rank,
        totalCents: row.totalCents,
        matchCents: total.match.hundredths,
        serijaCents: total.serija.hundredths,
        standingsCents: total.standings.toCents(),
        survivalCents: total.survival.hundredths,
        bingo: rows.matches.filter(
          (match) => match.player === row.player && countsAsBingo(match.points),
        ).length,
        stages: Object.freeze({
          place: stageCents(standings, ({ place }) => place),
          playOffs: stageCents(standings, ({ playOffs }) => playOffs),
          finalFour: stageCents(standings, ({ finalFour }) => finalFour),
          final: stageCents(standings, ({ final }) => final),
        }),
        history: history.get(row.player) ?? [],
      });
    }),
  );
}
