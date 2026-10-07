import { roundUnits } from '../points/fixed-point';
import {
  totalsAfterEachGame,
  type EarnedPoints,
} from '../ranking/rank-history';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId } from '../shared/ids';

export interface HistoryEntry {
  readonly game: GameId;
  /** The player's cumulative total after this game, to the cent. */
  readonly totalCents: number;
  /**
   * What the player earned at this game, to the cent ("+ Tšk"): its match
   * points and serija, and under R-17 the standings and survival points
   * counted from it. sportbet's game_points is the match points and serija
   * alone, since it adds the rest from the first game.
   */
  readonly gainedCents: number;
  readonly rank: number;
}

function totalsOrThrow(
  games: readonly GameId[],
  earned: readonly EarnedPoints[],
  rules: RuleSet,
) {
  const totals = totalsAfterEachGame(games, earned, rules);
  if (!totals.ok) {
    throw new Error('leagueHistory: points earned at a game not listed');
  }
  return totals.value;
}

/**
 * PointController::getRankHistory and getAllUsersGameHistory: each listed
 * player's rank after every scored game of the tournament (by tip-off then
 * id), by the cumulative total (totalsAfterEachGame: RA-5, R-17); players
 * equal on it and on the cumulative match points share a rank
 * (Ranking::competition). Every listed player has an entry at every game,
 * 0 before their first points, as sportbet's roster loop gives. Points
 * counted from a game not scored yet (a stage tick entered before its
 * stage's last game is played, R-72) count from the latest scored game:
 * they are in the table now.
 */
export function leagueHistory(input: {
  readonly season: Season;
  readonly earned: readonly EarnedPoints[];
  readonly listed: ReadonlySet<PlayerId>;
  readonly rules: RuleSet;
}): ReadonlyMap<PlayerId, readonly HistoryEntry[]> {
  const { season, listed, rules } = input;
  const games = season.games
    .filter((game) => game.result !== null)
    .sort((a, b) => a.tipOff - b.tipOff || a.id - b.id)
    .map((game) => game.id);
  const latest = games.at(-1);
  const history = new Map<PlayerId, HistoryEntry[]>();
  if (latest === undefined) return history;

  const scored = new Set(games);
  const earned = input.earned
    .filter(({ player }) => listed.has(player))
    .map((entry) =>
      scored.has(entry.atGame) ? entry : { ...entry, atGame: latest },
    );
  const totals = totalsOrThrow(games, earned, rules);
  const matches = totalsOrThrow(
    games,
    earned.filter(({ kind }) => kind === 'match'),
    rules,
  );
  const gainedAt = new Map<GameId, Map<PlayerId, number>>();
  for (const entry of earned) {
    const spreadBack =
      (entry.kind === 'standings' || entry.kind === 'survival') &&
      !rules.rankHistoryFromWhenEarned;
    if (spreadBack) continue;
    const atGame = gainedAt.get(entry.atGame) ?? new Map<PlayerId, number>();
    atGame.set(
      entry.player,
      (atGame.get(entry.player) ?? 0) + entry.points.tenThousandths,
    );
    gainedAt.set(entry.atGame, atGame);
  }

  for (const [index, after] of totals.entries()) {
    const matchAfter = matches[index]?.cents ?? {};
    const gained = gainedAt.get(after.game);
    const standing = [...listed].map((player) => ({
      player,
      cents: after.cents[player] ?? 0,
      match: matchAfter[player] ?? 0,
    }));
    standing.sort((a, b) => b.cents - a.cents || b.match - a.match);
    let rank = 0;
    for (const [position, row] of standing.entries()) {
      const before = standing[position - 1];
      rank =
        before?.cents === row.cents && before.match === row.match
          ? rank
          : position + 1;
      const entries = history.get(row.player) ?? [];
      entries.push(
        Object.freeze({
          game: after.game,
          totalCents: row.cents,
          gainedCents: roundUnits(gained?.get(row.player) ?? 0, 2),
          rank,
        }),
      );
      history.set(row.player, entries);
    }
  }
  return history;
}

/**
 * Ranking::change: the rank five history entries before the latest (or the
 * first, if there are fewer) minus the rank now; positive is a climb. Null
 * under two entries.
 */
export function rankChange(
  ranks: readonly number[],
  rank: number,
): number | null {
  if (ranks.length < 2) return null;
  const back = ranks[Math.max(0, ranks.length - 6)];
  return back === undefined ? null : back - rank;
}
