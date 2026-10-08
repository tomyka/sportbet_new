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
   * The change in the total since the entry before ("+ Tšk"), so the gains
   * add up to the total exactly: under R-17 (R-72 amended) a game's match
   * points, serija and the standings and survival counted from it; under
   * sportbetRules the first entry also carries the standings and survival
   * it spreads from the first game.
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
  for (const [index, after] of totals.entries()) {
    const standing = rankedAt(listed, after.cents, matches[index]?.cents ?? {});
    for (const { player, cents, rank } of standing) {
      const entries = history.get(player) ?? [];
      entries.push(
        Object.freeze({
          game: after.game,
          totalCents: cents,
          gainedCents: cents - (entries.at(-1)?.totalCents ?? 0),
          rank,
        }),
      );
      history.set(player, entries);
    }
  }
  return history;
}

/**
 * The listed players ranked after one game (Ranking::competition): by the
 * cumulative total, then the cumulative match points; equal on both share
 * a rank (1, 2, 2, 4).
 */
function rankedAt(
  listed: ReadonlySet<PlayerId>,
  cents: Readonly<Partial<Record<PlayerId, number>>>,
  matchCents: Readonly<Partial<Record<PlayerId, number>>>,
): { player: PlayerId; cents: number; rank: number }[] {
  const standing = [...listed].map((player) => ({
    player,
    cents: cents[player] ?? 0,
    match: matchCents[player] ?? 0,
  }));
  standing.sort((a, b) => b.cents - a.cents || b.match - a.match);
  let rank = 0;
  return standing.map((row, position) => {
    const before = standing[position - 1];
    rank =
      before?.cents === row.cents && before.match === row.match
        ? rank
        : position + 1;
    return { player: row.player, cents: row.cents, rank };
  });
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
