/**
 * What a write says of the cached reads that derive from the stored points
 * or from who is listed (the leaderboard, the hub's guest panels, the public
 * league): `boardChanged` is true when the write moved a stored point row or
 * changed who a table lists, so web expires those caches (`expireBoard`) and
 * only then. Decided where the write happens: by whether the writer
 * recalculated (`recalculateAndSave`) or changed a listing, never by its
 * caller.
 */
export interface BoardEffect {
  readonly boardChanged: boolean;
}

/**
 * A write that recalculated, changed a listing, or changed the season
 * (every game and round writer in season/): the cached public league reads
 * the season (loadSeason), and its rank history places standings and
 * survival points at the last game of a stage in play order
 * (earnedPointsOf, placedAtScoredGames), so a game or round inserted, moved or
 * deleted can change that view though it moves no stored point.
 */
export const BOARD_CHANGED: BoardEffect = { boardChanged: true };
