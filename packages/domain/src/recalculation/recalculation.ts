import { CrowdOdds } from '../odds/crowd-odds';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import type { MatchPrediction } from '../prediction/match-prediction';
import { scoreMatch, type MatchPoints } from '../prediction/match-scoring';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import { walkSerija } from '../serija/serija';
import { idKey, type GameId, type PlayerId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import type { StandingsPrediction } from '../standings/standings-prediction';
import {
  scoreStandings,
  type StandingsRow,
} from '../standings/standings-scoring';
import type { TeamOutcomes } from '../standings/team-outcomes';
import {
  byTipOffThenId,
  survivalPoints,
  type SurvivalPoints,
  type SurvivalRefusal,
  type SurvivalSource,
} from './survival-points';

export type {
  StoredSurvivalRow,
  SurvivalPoints,
  SurvivalSource,
} from './survival-points';

/** One tournament's stored inputs: everything its points are derived from. */
export interface TournamentInputs {
  readonly season: Season;
  /** The tournament's players: each gets a total, 0 when they have no rows. */
  readonly players: readonly PlayerId[];
  /** Every match prediction row, real and filled in, of any player. */
  readonly predictions: readonly MatchPrediction[];
  /**
   * CO-7: `'from-votes'` computes each scored game's odds from its
   * predictions, as a result entry does (CO-1 to CO-6); a map reads back
   * the odds each game was scored with, as sportbet's full recalculation
   * does (LR-5). A scored game missing from the map has sportbet's missing
   * row (CO-5); odds stored for a game without a result are ignored, as
   * only a scored game is scored.
   */
  readonly odds: 'from-votes' | ReadonlyMap<GameId, CrowdOdds>;
  readonly survival: SurvivalSource;
  /** Every player's standings prediction; the crowd is all of them. */
  readonly standings: readonly StandingsPrediction[];
  readonly outcomes: TeamOutcomes;
}

/**
 * A `game_odds` row: the odds a scored game was scored with. A game scored
 * at CO-5's missing odds has no row (production stores none for it); the
 * 1.0 it was scored at is on its MatchRows' `points.odds`.
 */
export interface GameOdds {
  readonly game: GameId;
  readonly odds: CrowdOdds;
}

/** A `point_results` row: one prediction's points and its serija bonus. */
export interface MatchRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly points: MatchPoints;
  /** `streak_bonus` (SE-3). */
  readonly serija: Points;
}

/** RA-1: a player's four parts; the league table adds them (rankPlayers). */
export interface TournamentTotal {
  readonly player: PlayerId;
  /** The sum of the player's match points (`full_points`). */
  readonly match: Points;
  readonly serija: Points;
  /** The sum of every standings column, nulls as 0. */
  readonly standings: StandingsPoints;
  /** SU-2: the sum of the stored running totals. */
  readonly survival: Points;
}

/** Every derived row of one tournament, each keyed by its identity. */
export interface TournamentPoints {
  /** Each scored game with an odds row (not CO-5's missing), by tip-off then id. */
  readonly odds: readonly GameOdds[];
  /** By game (tip-off then id), then in the order the predictions came. */
  readonly matches: readonly MatchRow[];
  /** `point_standings`: by prediction, then by the prediction's rows. */
  readonly standings: readonly StandingsRow[];
  /** By player, then round, then stored id (rows within a round by id). */
  readonly survival: readonly SurvivalPoints[];
  /** The players first, then anyone else with a row, in order of appearance. */
  readonly totals: readonly TournamentTotal[];
}

/**
 * A `point_results` row as stored: a MatchRow without `extendsSerija`,
 * which is derived during the walk and no stored row holds. A MatchRow is
 * one.
 */
export interface StoredMatchRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly points: Omit<MatchPoints, 'extendsSerija'>;
  /** `streak_bonus` (SE-3). */
  readonly serija: Points;
}

/**
 * Every stored points row of one tournament, as the database keeps them:
 * a TournamentPoints without its totals (sums of these rows). A
 * TournamentPoints from recalculateTournament is one, and so are the rows
 * production stored, read back.
 */
export interface PointsRows {
  readonly odds: readonly GameOdds[];
  readonly matches: readonly StoredMatchRow[];
  readonly standings: readonly StandingsRow[];
  readonly survival: readonly SurvivalPoints[];
}

export type RecalculationRefusal =
  | 'prediction-for-unknown-game'
  | 'two-predictions-for-one-game'
  | 'odds-for-unknown-game'
  /** CO-5: a scored game without stored odds, under a set without a missing row. */
  | 'odds-missing'
  | 'two-standings-predictions'
  /** R-5's 'survival-scored-from-picks', and survival's other refusals. */
  | SurvivalRefusal;

/**
 * LR-5's full recalculation of one tournament under `rules`: every
 * `game_odds`, `point_results` (with the serija), `point_standings` and
 * `point_survivals` row its stored inputs give, and each player's total -
 * the only way the domain derives them. Tournaments never share a run
 * (SE-2, #122, #217), so each is recalculated on its own.
 *
 * The order is sportbet's: each scored game's crowd odds (from the votes,
 * or as stored), then its match points (MS rules), then the serija over
 * every game with a result (SE-1 to SE-3), survival (SU rules) and the
 * standings (ST rules), then the totals (RA-1, SU-2). Fill-ins are not
 * made here: they are inputs, made by result entry (FI rules).
 *
 * Survival follows the rule set. The ruled set folds each pick history
 * against the results (R-5); stored rows are refused there. sportbet
 * refolds the stored rows (SU-10), each paid by its team's game in the
 * season; given a pick history instead, it first derives the rows its
 * result entries stored - assuming, as sportbet's result-entry pass does,
 * that rounds were decided in round order (survivalAtResultEntry) - and
 * refolds those. A team with two games in one round is decided and paid
 * by the earlier (tip-off, then id): sportbet's query leaves that order
 * unspecified, and Euroleague has no such round. Stored rows are folded
 * by round, then id. A pick must be in a round of the season that carries
 * survival (SU-7); a stored row only in a round of the season, as
 * sportbet's refold reads every stored row whatever the round's flag.
 *
 * Whether a finished tournament may be recalculated at all is the
 * season's (Season.mayRecalculateAt, LR-6), asked by the caller.
 */
export function recalculateTournament(
  inputs: TournamentInputs,
  rules: RuleSet,
): Result<TournamentPoints, RecalculationRefusal> {
  const votes = checkedInputs(inputs);
  if (!votes.ok) return votes;
  const games = scoreGames(inputs, votes.value, rules);
  if (!games.ok) return games;
  const matches = withSerija(inputs.season, games.value.scored);
  const survival = survivalPoints(inputs.survival, inputs.season, rules);
  if (!survival.ok) return survival;
  const standings = scoreStandings(inputs.standings, inputs.outcomes, rules);
  return ok(
    Object.freeze({
      odds: Object.freeze(games.value.odds),
      matches: Object.freeze(matches),
      standings,
      survival: survival.value,
      totals: sumTournamentTotals(inputs.players, {
        matches,
        standings,
        survival: survival.value,
      }),
    }),
  );
}

/**
 * The inputs refused where they cannot be a tournament's: a prediction of
 * a game not in the season or two of one player for one game, stored odds
 * of a game not in the season, two standings predictions of one player.
 * Accepted: each game's predictions (its votes), in the order they came.
 */
function checkedInputs(
  inputs: TournamentInputs,
): Result<ReadonlyMap<GameId, MatchPrediction[]>, RecalculationRefusal> {
  const { season } = inputs;
  const predictionsOf = new Map<GameId, MatchPrediction[]>();
  const seen = new Set<string>();
  for (const prediction of inputs.predictions) {
    if (season.game(prediction.game) === undefined) {
      return refuse('prediction-for-unknown-game');
    }
    const key = idKey(prediction.player, prediction.game);
    if (seen.has(key)) {
      return refuse('two-predictions-for-one-game');
    }
    seen.add(key);
    predictionsOf.set(prediction.game, [
      ...(predictionsOf.get(prediction.game) ?? []),
      prediction,
    ]);
  }
  if (
    inputs.odds !== 'from-votes' &&
    [...inputs.odds.keys()].some((game) => season.game(game) === undefined)
  ) {
    return refuse('odds-for-unknown-game');
  }
  const standingsPlayers = new Set(inputs.standings.map((each) => each.player));
  if (standingsPlayers.size !== inputs.standings.length) {
    return refuse('two-standings-predictions');
  }
  return ok(predictionsOf);
}

/** A scored prediction, before its serija bonus. */
interface ScoredCall {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly points: MatchPoints;
}

/**
 * A scored game's crowd odds (CO-7): from its votes, or as stored - a
 * game missing from the stored odds has sportbet's missing row (CO-5),
 * refused under a set without one.
 */
function crowdFor(
  game: Game,
  votes: readonly MatchPrediction[],
  storedOdds: TournamentInputs['odds'],
  rules: RuleSet,
): Result<CrowdOdds, 'odds-missing'> {
  if (storedOdds === 'from-votes') return ok(CrowdOdds.forGame(votes, rules));
  const stored = storedOdds.get(game.id);
  if (stored === undefined && !rules.missingOddsScoreAtOne) {
    return refuse('odds-missing');
  }
  return ok(stored ?? CrowdOdds.missing(rules));
}

/**
 * Each scored game, by tip-off then id: its crowd odds (a game_odds row
 * unless CO-5's missing), then each of its predictions' match points.
 */
function scoreGames(
  inputs: TournamentInputs,
  predictionsOf: ReadonlyMap<GameId, MatchPrediction[]>,
  rules: RuleSet,
): Result<
  { readonly odds: GameOdds[]; readonly scored: ScoredCall[] },
  'odds-missing'
> {
  const { season } = inputs;
  const odds: GameOdds[] = [];
  const scored: ScoredCall[] = [];
  for (const game of [...season.games].sort(byTipOffThenId)) {
    if (game.result === null) continue;
    const votes = predictionsOf.get(game.id) ?? [];
    const crowd = crowdFor(game, votes, inputs.odds, rules);
    if (!crowd.ok) return crowd;
    if (crowd.value.source !== 'missing') {
      odds.push(Object.freeze({ game: game.id, odds: crowd.value }));
    }
    const round = season.round(game.round);
    if (round === undefined) {
      throw new Error('recalculateTournament: a game outside its season');
    }
    for (const prediction of votes) {
      const points = scoreMatch(prediction, game, round, crowd.value);
      if (points !== null) {
        scored.push({ player: prediction.player, game: game.id, points });
      }
    }
  }
  return ok({ odds, scored });
}

/** The serija (SE-1 to SE-3), per player over every game with a result. */
function withSerija(season: Season, scored: readonly ScoredCall[]): MatchRow[] {
  const pointsAt = new Map(
    scored.map((row) => [idKey(row.player, row.game), row.points]),
  );
  const bonusAt = new Map<string, Points>();
  for (const player of new Set(scored.map((row) => row.player))) {
    for (const { game, bonus } of walkSerija(
      season,
      (id) => pointsAt.get(idKey(player, id)) ?? null,
    )) {
      bonusAt.set(idKey(player, game), bonus);
    }
  }
  return scored.map((row) =>
    Object.freeze({
      ...row,
      serija: bonusAt.get(idKey(row.player, row.game)) ?? Points.ZERO,
    }),
  );
}

/**
 * RA-1, SU-2: each player's four parts, summed from one rule set's rows -
 * the players given first (each with zero if they have no row), then
 * anyone else with a row, in order of appearance. recalculateTournament
 * totals its own rows with it, and a page reading stored rows (the hub's
 * top 5) totals them with it too: the only place points are added up.
 */
export function sumTournamentTotals(
  players: readonly PlayerId[],
  rows: {
    readonly matches: readonly StoredMatchRow[];
    readonly standings: readonly StandingsRow[];
    readonly survival: readonly SurvivalPoints[];
  },
): readonly TournamentTotal[] {
  const totals = new Map<
    PlayerId,
    {
      match: Points;
      serija: Points;
      standings: StandingsPoints;
      survival: Points;
    }
  >();
  const of = (player: PlayerId) => {
    let total = totals.get(player);
    if (total === undefined) {
      total = {
        match: Points.ZERO,
        serija: Points.ZERO,
        standings: StandingsPoints.ZERO,
        survival: Points.ZERO,
      };
      totals.set(player, total);
    }
    return total;
  };
  for (const player of players) of(player);
  for (const row of rows.matches) {
    const total = of(row.player);
    total.match = total.match.plus(row.points.full);
    total.serija = total.serija.plus(row.serija);
  }
  for (const row of rows.standings) {
    const total = of(row.player);
    for (const line of [row.place, row.playOffs, row.finalFour, row.final]) {
      if (line.points !== null) {
        total.standings = total.standings.plus(line.points);
      }
    }
  }
  for (const row of rows.survival) {
    const total = of(row.player);
    if (row.points !== null) {
      total.survival = total.survival.plus(row.points);
    }
  }
  return Object.freeze(
    [...totals].map(([player, total]) => Object.freeze({ player, ...total })),
  );
}
