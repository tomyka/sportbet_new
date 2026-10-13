import {
  earnedPointsOf,
  placedAtScoredGames,
} from '../dashboard/earned-points';
import type { LeagueTableRow } from '../dashboard/league-table-rows';
import { roundUnits } from '../points/fixed-point';
import type { EarnedPoints } from '../ranking/rank-history';
import type { PointsRows } from '../recalculation/recalculation';
import type { Season } from '../round/season';
import type { PlayerId, RoundNumber } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';

/** `self` is checked first, as sportbet's CompareController does. */
export type CompareRefusal = 'self' | 'not-listed';

export interface CompareSide {
  readonly player: PlayerId;
  readonly username: string;
  readonly rank: number;
  readonly totalCents: number;
  readonly matchCents: number;
  readonly standingsCents: number;
  readonly survivalCents: number;
  readonly serijaCents: number;
  readonly bingo: number;
}

export interface CompareRound {
  readonly round: RoundNumber;
  readonly name: string;
  readonly meCents: number;
  readonly themCents: number;
}

export interface Comparison {
  readonly me: CompareSide;
  readonly them: CompareSide;
  /** Rounds won, drawn and lost by the viewer; null with no round. */
  readonly record: {
    readonly wins: number;
    readonly draws: number;
    readonly losses: number;
  } | null;
  readonly rounds: readonly CompareRound[];
}

function sideOf(row: LeagueTableRow): CompareSide {
  return Object.freeze({
    player: row.player,
    username: row.username,
    rank: row.rank,
    totalCents: row.totalCents,
    matchCents: row.matchCents,
    standingsCents: row.standingsCents,
    survivalCents: row.survivalCents,
    serijaCents: row.serijaCents,
    bingo: row.bingo,
  });
}

/**
 * One player's points by round, to the cent, so that the rounds add up to
 * the table total exactly: the running total through each round is rounded
 * once and a round is the change in it, as leagueHistory's gains are.
 */
function centsByRound(
  season: Season,
  earned: readonly EarnedPoints[],
  rounds: readonly RoundNumber[],
): ReadonlyMap<RoundNumber, number> {
  const roundOf = (entry: EarnedPoints): RoundNumber => {
    const game = season.game(entry.atGame);
    if (game === undefined) {
      throw new Error('comparePlayers: points at a game not in the season');
    }
    return game.round;
  };
  const tenThousandths = new Map<RoundNumber, number>();
  for (const entry of earned) {
    const round = roundOf(entry);
    tenThousandths.set(
      round,
      (tenThousandths.get(round) ?? 0) + entry.points.tenThousandths,
    );
  }
  let running = 0;
  let roundedBefore = 0;
  const cents = new Map<RoundNumber, number>();
  for (const round of rounds) {
    running += tenThousandths.get(round) ?? 0;
    const rounded = roundUnits(running, 2);
    cents.set(round, rounded - roundedBefore);
    roundedBefore = rounded;
  }
  return cents;
}

function recordOf(
  rounds: readonly CompareRound[],
): NonNullable<Comparison['record']> | null {
  if (rounds.length === 0) return null;
  const wins = rounds.filter(({ meCents, themCents }) => meCents > themCents);
  const losses = rounds.filter(({ meCents, themCents }) => meCents < themCents);
  return Object.freeze({
    wins: wins.length,
    draws: rounds.length - wins.length - losses.length,
    losses: losses.length,
  });
}

/**
 * CompareController::show and getPerRoundComparison: the viewer against
 * another listed player. Refused `self` (oneself goes home) before
 * `not-listed` (either player outside the table: sportbet 404s on the other
 * and would fail on the viewer). Each side's parts, rank and bingos are its
 * league table row's. "Etapai" lists the rounds with a scored game in season
 * order, each side's points counted at the games R-72 places them
 * (placedAtScoredGames) so every kind is in, and the rounds add up to the
 * table total (R-85).
 */
export function comparePlayers(input: {
  readonly season: Season;
  readonly table: readonly LeagueTableRow[];
  readonly rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'>;
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
  readonly viewer: PlayerId;
  readonly other: PlayerId;
}): Result<Comparison, CompareRefusal> {
  const { season, table, viewer, other } = input;
  if (viewer === other) return refuse('self');
  const me = table.find(({ player }) => player === viewer);
  const them = table.find(({ player }) => player === other);
  if (me === undefined || them === undefined) return refuse('not-listed');

  const placed = placedAtScoredGames(
    season,
    earnedPointsOf(season, input.rows),
  );
  const scoredRounds = [
    ...new Set(
      season.games.filter((game) => game.result !== null).map((g) => g.round),
    ),
  ].sort((a, b) => a - b);
  const mine = centsByRound(
    season,
    placed.filter(({ player }) => player === viewer),
    scoredRounds,
  );
  const theirs = centsByRound(
    season,
    placed.filter(({ player }) => player === other),
    scoredRounds,
  );
  const rounds = scoredRounds.map((round): CompareRound => {
    const name = input.roundNames.get(round);
    if (name === undefined) {
      throw new Error('comparePlayers: a round without a name');
    }
    return Object.freeze({
      round,
      name,
      meCents: mine.get(round) ?? 0,
      themCents: theirs.get(round) ?? 0,
    });
  });
  return ok(
    Object.freeze({
      me: sideOf(me),
      them: sideOf(them),
      record: recordOf(rounds),
      rounds,
    }),
  );
}
