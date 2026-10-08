import type { Points } from '../points/points';
import {
  standingsPointsOfTenThousandths,
  type StandingsPoints,
} from '../points/standings-points';
import type { EarnedPoints } from '../ranking/rank-history';
import type { PointsRows } from '../recalculation/recalculation';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import { LAST_REGULAR_SEASON_ROUND, type Stage } from '../round/stage';

/** Hundredths as ten-thousandths, so every kind adds exactly. */
const asStandings = (points: Points): StandingsPoints =>
  standingsPointsOfTenThousandths(points.hundredths * 100);

/**
 * The game each stored points row counts from in the rank history
 * (RA-5; R-17 under ruledRules, R-72): a match row at its game; a survival
 * row at the game its team played in its round; a standings row's place at
 * round 38's last game, and each tick at the last game of the stage that
 * decides it (play-offs: the regular season and the play-in; Final Four:
 * the play-offs; the final place: the final). A line whose stage has no
 * game yet counts from the season's last game. Under sportbetRules
 * totalsAfterEachGame spreads standings and survival back to the first
 * game whatever atGame is.
 */
export function earnedPointsOf(
  season: Season,
  rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'>,
): readonly EarnedPoints[] {
  const ordered = [...season.games].sort(
    (a, b) => a.tipOff - b.tipOff || a.id - b.id,
  );
  return Object.freeze([
    ...matchEarned(rows.matches),
    ...standingsEarned(rows.standings, standingsAnchors(season, ordered)),
    ...survivalEarned(rows.survival, ordered),
  ]);
}

/** A match row's points and its serija bonus, each at its own game. */
function matchEarned(rows: PointsRows['matches']): EarnedPoints[] {
  return rows.flatMap((row) => [
    {
      player: row.player,
      kind: 'match' as const,
      points: asStandings(row.points.full),
      atGame: row.game,
    },
    {
      player: row.player,
      kind: 'serija' as const,
      points: asStandings(row.serija),
      atGame: row.game,
    },
  ]);
}

/** The game each standings line counts from (undefined: no game at all). */
interface StandingsAnchors {
  readonly place: Game | undefined;
  readonly playOffs: Game | undefined;
  readonly finalFour: Game | undefined;
  readonly final: Game | undefined;
}

/**
 * Each line's game: the place at round 38's last game, each tick at the
 * last game of the stage that decides it; a stage with no game yet counts
 * from the season's last game.
 */
function standingsAnchors(
  season: Season,
  ordered: readonly Game[],
): StandingsAnchors {
  const stageOf = (game: Game): Stage | undefined =>
    season.round(game.round)?.stage;
  const lastOf = (picks: (game: Game) => boolean): Game | undefined =>
    ordered.filter(picks).at(-1) ?? ordered.at(-1);
  return {
    place: lastOf((game) => game.round === LAST_REGULAR_SEASON_ROUND),
    playOffs: lastOf((game) => {
      const stage = stageOf(game);
      return stage === 'regular' || stage === 'play-in';
    }),
    finalFour: lastOf((game) => stageOf(game) === 'play-offs'),
    final: lastOf((game) => stageOf(game) === 'final'),
  };
}

/** Each scored standings line, at its anchor game. */
function standingsEarned(
  rows: PointsRows['standings'],
  anchors: StandingsAnchors,
): EarnedPoints[] {
  return rows.flatMap((row) =>
    (
      [
        [row.place, anchors.place],
        [row.playOffs, anchors.playOffs],
        [row.finalFour, anchors.finalFour],
        [row.final, anchors.final],
      ] as const
    ).flatMap(([line, at]) => {
      if (line.points === null) return [];
      if (at === undefined) {
        throw new Error(
          'earnedPointsOf: a standings line in a season with no game',
        );
      }
      return [
        {
          player: row.player,
          kind: 'standings' as const,
          points: line.points,
          atGame: at.id,
        },
      ];
    }),
  );
}

/** Each scored survival pick, at its team's game in its round. */
function survivalEarned(
  rows: PointsRows['survival'],
  ordered: readonly Game[],
): EarnedPoints[] {
  return rows.flatMap((row) => {
    if (row.points === null) return [];
    const game = ordered.find(
      (candidate) =>
        candidate.round === row.round &&
        (candidate.home === row.team || candidate.away === row.team),
    );
    if (game === undefined) {
      throw new Error(
        'earnedPointsOf: a survival pick has no game in its round',
      );
    }
    return [
      {
        player: row.player,
        kind: 'survival' as const,
        points: asStandings(row.points),
        atGame: game.id,
      },
    ];
  });
}
