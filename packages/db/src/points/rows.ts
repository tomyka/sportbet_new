import {
  CrowdOdds,
  Odds,
  Points,
  roundNumber,
  StandingsOdds,
  StandingsPoints,
  type GameOdds,
  type PointsRows,
  type StandingsLine,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type Tournament,
} from '@sportbet/domain';
import { z } from 'zod';
import { gameOf, playerOf, stored, teamOf, unitsOf } from '../edge';
import type { TournamentScope } from '../tournament/scope';
import type { PointsSource } from './schema';

// The four points tables' rows: what a save writes (from a PointsRows) and
// what a load reads back (into one), each column through the domain's
// fixed-point factories.

const numericText = z.string();
const oddsRows = z.array(
  z.object({
    game: z.int(),
    home: numericText,
    away: numericText,
    draw: numericText,
  }),
);
const matchRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    winner: numericText,
    margin: numericText,
    bingo: numericText,
    full: numericText,
    odds: numericText,
    serija: numericText,
  }),
);
const line = numericText.nullable();
const standingsRows = z.array(
  z.object({
    player: z.int(),
    team: z.int(),
    placePoints: line,
    placeOdds: line,
    playOffsPoints: line,
    playOffsOdds: line,
    finalFourPoints: line,
    finalFourOdds: line,
    finalPoints: line,
    finalOdds: line,
  }),
);
const survivalRows = z.array(
  z.object({
    id: z.int(),
    sportbetId: z.int().nullable(),
    player: z.int(),
    round: z.int(),
    team: z.int(),
    points: numericText.nullable(),
    provisional: z.boolean(),
    storedRowId: z.int().nullable(),
  }),
);

const text = (value: { toString(): string } | null): string | null =>
  value === null ? null : value.toString();

const pointsOf = (value: string, table: string, key: string): Points =>
  stored(Points.ofHundredths(unitsOf(value, 2, table, key)), table, key);

/** Selected game_odds rows as the domain's GameOdds. */
export function oddsOf(rows: unknown, source: PointsSource): GameOdds[] {
  return oddsRows.parse(rows).map((row) => {
    const key = `${source}/${String(row.game)}`;
    const odds = (value: string) =>
      stored(
        Odds.ofHundredths(unitsOf(value, 2, 'game_odds', key)),
        'game_odds',
        key,
      );
    return {
      game: gameOf(row.game),
      odds: CrowdOdds.stored(odds(row.home), odds(row.away), odds(row.draw)),
    };
  });
}

/** Selected match_points rows as the domain's StoredMatchRows. */
export function matchesOf(
  rows: unknown,
  source: PointsSource,
): StoredMatchRow[] {
  return matchRows.parse(rows).map((row) => {
    const key = `${source}/${String(row.player)}/${String(row.game)}`;
    const of = (value: string) => pointsOf(value, 'match_points', key);
    return {
      player: playerOf(row.player),
      game: gameOf(row.game),
      points: {
        winner: of(row.winner),
        margin: of(row.margin),
        bingo: of(row.bingo),
        full: of(row.full),
        odds: stored(
          Odds.ofHundredths(unitsOf(row.odds, 2, 'match_points', key)),
          'match_points',
          key,
        ),
      },
      serija: of(row.serija),
    };
  });
}

/** One standings line's two columns, in ten-thousandths. */
function standingsLine(
  points: string | null,
  odds: string | null,
  key: string,
): StandingsLine {
  return {
    points:
      points === null
        ? null
        : stored(
            StandingsPoints.ofTenThousandths(
              unitsOf(points, 4, 'standings_points', key),
            ),
            'standings_points',
            key,
          ),
    odds:
      odds === null
        ? null
        : stored(
            StandingsOdds.ofTenThousandths(
              unitsOf(odds, 4, 'standings_points', key),
            ),
            'standings_points',
            key,
          ),
  };
}

/** Selected standings_points rows as the domain's StandingsRows. */
export function standingsOf(
  rows: unknown,
  source: PointsSource,
): StandingsRow[] {
  return standingsRows.parse(rows).map((row) => {
    const key = `${source}/${String(row.player)}/${String(row.team)}`;
    return {
      player: playerOf(row.player),
      team: teamOf(row.team),
      place: standingsLine(row.placePoints, row.placeOdds, key),
      playOffs: standingsLine(row.playOffsPoints, row.playOffsOdds, key),
      finalFour: standingsLine(row.finalFourPoints, row.finalFourOdds, key),
      final: standingsLine(row.finalPoints, row.finalOdds, key),
    };
  });
}

/**
 * Selected survival_points rows as the domain's SurvivalPoints. A
 * production row's `storedId` is its `sportbet_id`, a derived row's the
 * `stored_row_id` it rewrites.
 */
export function survivalOf(
  rows: unknown,
  source: PointsSource,
): SurvivalPoints[] {
  return survivalRows.parse(rows).map((row) => {
    const key = String(row.id);
    return {
      player: playerOf(row.player),
      round: stored(roundNumber(row.round), 'survival_points', key),
      team: teamOf(row.team),
      points:
        row.points === null
          ? null
          : pointsOf(row.points, 'survival_points', key),
      provisional: row.provisional,
      storedId: source === 'production' ? row.sportbetId : row.storedRowId,
    };
  });
}

/** What a save writes: each table's values, every id checked against the scope. */
export interface PointsValues {
  readonly odds: ReturnType<typeof oddsValues>;
  readonly matches: ReturnType<typeof matchValues>;
  readonly standings: ReturnType<typeof standingsValues>;
  readonly survival: ReturnType<typeof survivalValues>;
}

const SAVE = 'saveTournamentPoints';

function oddsValues(
  scope: TournamentScope,
  source: PointsSource,
  rows: PointsRows['odds'],
) {
  return rows.map(({ game, odds: crowd }) => ({
    source,
    gameId: scope.game(game, SAVE),
    home: crowd.home.toString(),
    away: crowd.away.toString(),
    draw: crowd.draw.toString(),
  }));
}

function matchValues(
  scope: TournamentScope,
  source: PointsSource,
  rows: PointsRows['matches'],
) {
  return rows.map((row) => ({
    source,
    playerId: scope.player(row.player, SAVE),
    gameId: scope.game(row.game, SAVE),
    winner: row.points.winner.toString(),
    margin: row.points.margin.toString(),
    bingo: row.points.bingo.toString(),
    full: row.points.full.toString(),
    odds: row.points.odds.toString(),
    serija: row.serija.toString(),
  }));
}

function standingsValues(
  scope: TournamentScope,
  source: PointsSource,
  rows: PointsRows['standings'],
) {
  return rows.map((row) => ({
    source,
    playerId: scope.player(row.player, SAVE),
    teamId: scope.team(row.team, SAVE),
    placePoints: text(row.place.points),
    placeOdds: text(row.place.odds),
    playOffsPoints: text(row.playOffs.points),
    playOffsOdds: text(row.playOffs.odds),
    finalFourPoints: text(row.finalFour.points),
    finalFourOdds: text(row.finalFour.odds),
    finalPoints: text(row.final.points),
    finalOdds: text(row.final.odds),
  }));
}

/**
 * A production survival row is the stored row itself: its `storedId` is
 * sportbet's id, kept as its `sportbet_id`; a derived row's `storedId` is
 * the production row it rewrites.
 */
function survivalValues(
  scope: TournamentScope,
  source: PointsSource,
  rows: PointsRows['survival'],
) {
  const tournament: Tournament = scope.tournament;
  return rows.map((row) => {
    const values = {
      source,
      playerId: scope.player(row.player, SAVE),
      tournamentId: tournament.id,
      roundId: scope.roundId(row.round, SAVE),
      teamId: scope.team(row.team, SAVE),
      points: text(row.points),
      provisional: row.provisional,
    };
    if (source !== 'production') {
      return { ...values, sportbetId: null, storedRowId: row.storedId };
    }
    if (row.storedId === null) {
      throw new Error(
        'saveTournamentPoints: a production survival row is a stored row and needs its id',
      );
    }
    return { ...values, sportbetId: row.storedId, storedRowId: null };
  });
}

/** The values a save writes for `rows`, each id checked against the scope. */
export function pointsValues(
  scope: TournamentScope,
  source: PointsSource,
  rows: PointsRows,
): PointsValues {
  return {
    odds: oddsValues(scope, source, rows.odds),
    matches: matchValues(scope, source, rows.matches),
    standings: standingsValues(scope, source, rows.standings),
    survival: survivalValues(scope, source, rows.survival),
  };
}
