import {
  activityFeed,
  fixtureDeck,
  gameOdds,
  rankChange,
  roundProgress,
  statTiles,
  tallyMedals,
  type ActivityFeed,
  type Instant,
  type MedalRow,
  type OddsPanel,
  type PlayerId,
  type RoundNumber,
  type RoundProgress,
  type RuleSet,
  type Season,
  type StatTiles,
  type StoredMatchRow,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loadPredictionsPage, type PredictionLine } from '../prediction/page';
import { rounds } from '../season/schema';
import { teamNamesOf } from '../team/repository';
import { loadFinalPlaces } from '../hub/repository';
import { loadScoredOrigins } from './standing';
import {
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

/**
 * A predictions page line on the game page. `predict`: its card offers
 * "Spėti" (R-75); `odds`: the odds panel its row shows, or none (gameOdds,
 * R-61).
 */
export type DashboardGame = PredictionLine & {
  readonly predict: boolean;
  readonly odds: OddsPanel | null;
};

export interface DashboardRequest {
  readonly player: PlayerId;
  readonly tournament: Tournament;
  readonly now: Instant;
  readonly rules: RuleSet;
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
  const { tournament, now, rules } = request;
  const { table, season, standing } = await readLeagueTable(
    db,
    tournament,
    rules,
  );
  const { rows, listed, usernames } = standing;

  const me = await dashboardMe(db, {
    request,
    table,
    season,
    matches: rows.matches,
  });
  const current = season.currentRound(now, rules);
  const progress = roundProgress({ season, current, now });
  const medals = await medalsOf(db, { tournament, season, now, listed });

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
    games: current === null ? null : await deckOf(db, request),
  };
}

/** The player's own row, rank change and tiles (R-71), or null when not listed. */
async function dashboardMe(
  db: Executor,
  read: {
    readonly request: DashboardRequest;
    readonly table: Dashboard['table'];
    readonly season: Season;
    readonly matches: readonly StoredMatchRow[];
  },
): Promise<DashboardMe | null> {
  const { request, table, season, matches } = read;
  const { player, tournament, rules } = request;
  const row = table.rows.find((candidate) => candidate.player === player);
  if (row === undefined) return null;
  return {
    row,
    rankChange: rankChange(
      row.history.map(({ rank }) => rank),
      row.rank,
    ),
    tiles: statTiles({
      season,
      rows: matches.filter((match) => match.player === player),
      predictions: await loadScoredOrigins(db, tournament, rules, player),
    }),
  };
}

/** The listed players' medal tally, once the first game has tipped off. */
async function medalsOf(
  db: Executor,
  read: {
    readonly tournament: Tournament;
    readonly season: Season;
    readonly now: Instant;
    readonly listed: ReadonlySet<PlayerId>;
  },
): Promise<Dashboard['medals']> {
  const { tournament, season, now, listed } = read;
  const firstTipOff = season.firstTipOff();
  if (firstTipOff === null || firstTipOff > now) return null;
  return tallyMedals(
    (await loadFinalPlaces(db, tournament)).filter(({ player: who }) =>
      listed.has(who),
    ),
  );
}

/** The game page's games (fixtureDeck), each with its odds (R-61). */
async function deckOf(
  db: Executor,
  request: DashboardRequest,
): Promise<NonNullable<Dashboard['games']>> {
  const { player, tournament, now, rules } = request;
  const page = await loadPredictionsPage(db, {
    player,
    tournament,
    requested: null,
    now,
    rules,
  });
  return fixtureDeck(page.lines, now).map((line) => ({
    ...line,
    odds: gameOdds(line),
  }));
}
