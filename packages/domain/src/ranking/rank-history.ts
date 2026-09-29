import { roundUnits } from '../points/fixed-point';
import type { StandingsPoints } from '../points/standings-points';
import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';

export type PointsKind = 'match' | 'serija' | 'standings' | 'survival';

/** Points a player earned at one game. */
export interface EarnedPoints {
  readonly player: PlayerId;
  readonly kind: PointsKind;
  /** In ten-thousandths, whatever the kind, so every part adds exactly. */
  readonly points: StandingsPoints;
  readonly atGame: GameId;
}

export interface TotalsAfterGame {
  readonly game: GameId;
  /** Each player's total after this game, to the cent. */
  readonly cents: ReadonlyMap<PlayerId, number>;
}

/**
 * RA-5: each player's running total after each game, for the rank history.
 * Match and serija points count from the game they were earned at.
 * sportbet adds standings and survival points to every game from the
 * first; under R-17 they count from the game they were earned at too.
 * Points earned at a game not in `games` are refused.
 */
export function totalsAfterEachGame(
  games: readonly GameId[],
  earned: readonly EarnedPoints[],
  rules: RuleSet,
): Result<TotalsAfterGame[], 'points-at-unlisted-game'> {
  const position = new Map(games.map((game, index) => [game, index]));
  const counted: { readonly entry: EarnedPoints; readonly from: number }[] = [];
  for (const entry of earned) {
    const index = position.get(entry.atGame);
    if (index === undefined) {
      return refuse('points-at-unlisted-game');
    }
    const spreadBack =
      (entry.kind === 'standings' || entry.kind === 'survival') &&
      !rules.rankHistoryFromWhenEarned;
    counted.push({ entry, from: spreadBack ? 0 : index });
  }
  return ok(
    games.map((game, index) => {
      const totals = new Map<PlayerId, number>();
      for (const { entry, from } of counted) {
        if (from <= index) {
          totals.set(
            entry.player,
            (totals.get(entry.player) ?? 0) + entry.points.tenThousandths,
          );
        }
      }
      return {
        game,
        cents: new Map(
          [...totals].map(([player, tenThousandths]) => [
            player,
            roundUnits(tenThousandths, 2),
          ]),
        ),
      };
    }),
  );
}
