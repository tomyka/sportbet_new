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
  const stageOf = (game: Game): Stage | undefined =>
    season.round(game.round)?.stage;
  const lastOf = (picks: (game: Game) => boolean): Game | undefined =>
    ordered.filter(picks).at(-1) ?? ordered.at(-1);
  const placeAt = lastOf((game) => game.round === LAST_REGULAR_SEASON_ROUND);
  const playOffsAt = lastOf((game) => {
    const stage = stageOf(game);
    return stage === 'regular' || stage === 'play-in';
  });
  const finalFourAt = lastOf((game) => stageOf(game) === 'play-offs');
  const finalAt = lastOf((game) => stageOf(game) === 'final');

  const earned: EarnedPoints[] = [];
  for (const row of rows.matches) {
    earned.push(
      {
        player: row.player,
        kind: 'match',
        points: asStandings(row.points.full),
        atGame: row.game,
      },
      {
        player: row.player,
        kind: 'serija',
        points: asStandings(row.serija),
        atGame: row.game,
      },
    );
  }
  for (const row of rows.standings) {
    const lines = [
      [row.place, placeAt],
      [row.playOffs, playOffsAt],
      [row.finalFour, finalFourAt],
      [row.final, finalAt],
    ] as const;
    for (const [line, at] of lines) {
      if (line.points === null) continue;
      if (at === undefined) {
        throw new Error(
          'earnedPointsOf: a standings line in a season with no game',
        );
      }
      earned.push({
        player: row.player,
        kind: 'standings',
        points: line.points,
        atGame: at.id,
      });
    }
  }
  for (const row of rows.survival) {
    if (row.points === null) continue;
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
    earned.push({
      player: row.player,
      kind: 'survival',
      points: asStandings(row.points),
      atGame: game.id,
    });
  }
  return Object.freeze(earned);
}
