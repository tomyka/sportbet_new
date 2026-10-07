import {
  activityFeed,
  fixtureDeck,
  rankChange,
  roundProgress,
  statTiles,
  type ActivityFeed,
  type Instant,
  type MedalRow,
  type PlayerId,
  type RoundNumber,
  type RoundProgress,
  type RuleSet,
  type StatTiles,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loadPredictionsPage, type PredictionLine } from '../prediction/page';
import { loadPlayerPredictions } from '../prediction/repository';
import { rounds } from '../season/schema';
import { teamNamesOf } from '../team/repository';
import {
  loadLeagueMedals,
  readLeagueTable,
  type LeagueTable,
  type LeagueTableRow,
} from './league-table';

/** The viewer's own place: drawn only for a listed player. */
export interface DashboardMe {
  readonly row: LeagueTableRow;
  /** "↑N per 5 žaid." (Ranking::change); null under two history entries. */
  readonly rankChange: number | null;
  /** The bingo and serija tiles; null without a scored row, as sportbet draws no tiles then. */
  readonly tiles: StatTiles | null;
}

export interface Dashboard {
  readonly table: LeagueTable;
  readonly me: DashboardMe | null;
  /** The current round's progress line, with the round's name; null with no current round. */
  readonly progress: (RoundProgress & { readonly name: string }) | null;
  /** "Finalų dalyvių prognozės"; null until the first game has tipped off. */
  readonly medals: readonly MedalRow[] | null;
  /** "Aktyvumas". */
  readonly feed: ActivityFeed;
  /**
   * "Artimiausios rungtynės" and "Visos rungtynės": the current round's
   * lines as the predictions page draws them (loadPredictionsPage), cut to
   * the deck's days (fixtureDeck); null with no current round.
   */
  readonly games: readonly DashboardGame[] | null;
}

/** A predictions page line on the game page; `predict`: its card offers "Spėti" (R-75). */
export type DashboardGame = PredictionLine & { readonly predict: boolean };

export interface DashboardRequest {
  readonly player: PlayerId;
  readonly tournament: Tournament;
  readonly now: Instant;
  readonly rules: RuleSet;
  /** An instant's Vilnius calendar day, YYYY-MM-DD: the domain takes no time zone. */
  readonly vilniusDay: (instant: Instant) => string;
}

const roundNameRows = z.array(z.object({ name: z.string() }));

/** A stored round's name; a round of the season not stored is impossible. */
async function roundName(
  db: Executor,
  tournament: Tournament,
  round: RoundNumber,
): Promise<string> {
  const [row] = roundNameRows.parse(
    await db
      .select({ name: rounds.name })
      .from(rounds)
      .where(
        and(eq(rounds.tournamentId, tournament.id), eq(rounds.number, round)),
      ),
  );
  if (row === undefined) {
    throw new Error('loadDashboard: the current round is not stored');
  }
  return row.name;
}

/**
 * MainController::loadApp for one player and tournament (the request's,
 * R-28, R-46): the league table (R-73), the player's own row, rank change
 * and tiles (R-71), the progress line, the medal tally of the listed
 * players once the first game has tipped off, and the activity feed. It
 * only loads; the domain decides each panel.
 */
export async function loadDashboard(
  db: Executor,
  request: DashboardRequest,
): Promise<Dashboard> {
  const { player, tournament, now, rules, vilniusDay } = request;
  const { table, season, rows, listed, usernames } = await readLeagueTable(
    db,
    tournament,
    rules,
  );

  const row = table.rows.find((candidate) => candidate.player === player);
  const me: DashboardMe | null =
    row === undefined
      ? null
      : {
          row,
          rankChange: rankChange(
            row.history.map(({ rank }) => rank),
            row.rank,
          ),
          tiles: statTiles({
            season,
            rows: rows.matches.filter((match) => match.player === player),
            predictions: await loadPlayerPredictions(db, player, tournament),
          }),
        };

  const current = season.currentRound(now, rules);
  const progress = roundProgress({
    season,
    current,
    now,
    vilniusDay,
  });
  const firstTipOff = season.firstTipOff();
  const medals =
    firstTipOff === null || firstTipOff > now
      ? null
      : await loadLeagueMedals(db, tournament, rules);

  return {
    table,
    me,
    progress:
      progress === null
        ? null
        : {
            ...progress,
            name: await roundName(db, tournament, progress.round),
          },
    medals,
    feed: activityFeed({
      season,
      rows: rows.matches,
      listed,
      usernames,
      teamName: await teamNamesOf(db, tournament),
      rules,
    }),
    games:
      current === null
        ? null
        : fixtureDeck(
            (
              await loadPredictionsPage(db, {
                player,
                tournament,
                requested: null,
                now,
                rules,
              })
            ).lines,
            now,
            vilniusDay,
          ),
  };
}
