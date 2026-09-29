import { CrowdOdds } from '../odds/crowd-odds';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import type { MatchPrediction } from '../prediction/match-prediction';
import { scoreMatch, type MatchPoints } from '../prediction/match-scoring';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import { walkSerija } from '../serija/serija';
import {
  idKey,
  type GameId,
  type PlayerId,
  type RoundNumber,
  type TeamId,
} from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import type { StandingsPrediction } from '../standings/standings-prediction';
import {
  scoreStandings,
  type StandingsRow,
} from '../standings/standings-scoring';
import type { TeamOutcomes } from '../standings/team-outcomes';
import {
  refoldStoredSurvival,
  type JoinedSurvivalRow,
} from '../survival/stored-survival';
import {
  foldSurvival,
  survivalAtResultEntry,
  type SurvivalRow,
} from '../survival/survival-fold';
import type { SurvivalRun } from '../survival/survival-run';

/**
 * One `point_survivals` row as stored: the round a player's pick was scored
 * in, the team it was scored for, and the running total it stored (0 is the
 * round that was lost).
 */
export interface StoredSurvivalRow {
  /** `point_survivals.id`: two rows may share a player and a round. */
  readonly id: number;
  readonly player: PlayerId;
  readonly round: RoundNumber;
  readonly team: TeamId;
  readonly storedPoints: Points;
}

/**
 * What survival is scored from: each player's pick history, or the rows a
 * tournament stored (sportbet's picks are no history: a re-pick moves a
 * team's pick, SU-5, and a loss detaches the run's picks, SU-9). Which one a rule set scores from is its own
 * (`survivalScoredFromStoredRows`); the caller passes whichever it holds.
 */
export type SurvivalSource =
  | {
      readonly from: 'picks';
      readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
    }
  | {
      readonly from: 'stored-rows';
      readonly rows: readonly StoredSurvivalRow[];
    };

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

/** A `point_survivals` row: one pick's stored running total. */
export interface SurvivalPoints {
  readonly player: PlayerId;
  readonly round: RoundNumber;
  readonly team: TeamId;
  /** Null while the pick waits for its game (no row yet, SU-8). */
  readonly points: Points | null;
  /** A total an earlier, still pending pick will change (R-34). */
  readonly provisional: boolean;
  /** The stored row this rewrites; null when scored from the picks. */
  readonly storedId: number | null;
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
  /** By player, then round. */
  readonly survival: readonly SurvivalPoints[];
  /** The players first, then anyone else with a row, in order of appearance. */
  readonly totals: readonly TournamentTotal[];
}

export type RecalculationRefusal =
  | 'prediction-for-unknown-game'
  | 'two-predictions-for-one-game'
  | 'odds-for-unknown-game'
  /** CO-5: a scored game without stored odds, under a set without a missing row. */
  | 'odds-missing'
  | 'two-standings-predictions'
  /** R-5: the rule set scores survival from the pick history. */
  | 'survival-scored-from-picks'
  | 'survival-row-in-unknown-round'
  | 'survival-row-id-twice';

function byTipOffThenId(a: Game, b: Game): number {
  return a.tipOff - b.tipOff || a.id - b.id;
}

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
 * refolds those. A team with two games in one round is paid by the
 * earlier (tip-off, then id): sportbet's query leaves that order
 * unspecified, and Euroleague has no such round.
 *
 * Whether a finished tournament may be recalculated at all is the
 * season's (Season.mayRecalculateAt, LR-6), asked by the caller.
 */
export function recalculateTournament(
  inputs: TournamentInputs,
  rules: RuleSet,
): Result<TournamentPoints, RecalculationRefusal> {
  const { season } = inputs;
  const games = [...season.games].sort(byTipOffThenId);

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
    const list = predictionsOf.get(prediction.game) ?? [];
    list.push(prediction);
    predictionsOf.set(prediction.game, list);
  }
  if (inputs.odds !== 'from-votes') {
    for (const game of inputs.odds.keys()) {
      if (season.game(game) === undefined) {
        return refuse('odds-for-unknown-game');
      }
    }
  }
  if (
    new Set(inputs.standings.map((each) => each.player)).size !==
    inputs.standings.length
  ) {
    return refuse('two-standings-predictions');
  }

  // Crowd odds, then each scored game's points.
  const odds: GameOdds[] = [];
  const scored: { player: PlayerId; game: GameId; points: MatchPoints }[] = [];
  for (const game of games) {
    if (game.result === null) continue;
    const votes = predictionsOf.get(game.id) ?? [];
    let crowd: CrowdOdds;
    if (inputs.odds === 'from-votes') {
      crowd = CrowdOdds.forGame(votes, rules);
    } else {
      const stored = inputs.odds.get(game.id);
      if (stored === undefined && !rules.missingOddsScoreAtOne) {
        return refuse('odds-missing');
      }
      crowd = stored ?? CrowdOdds.missing(rules);
    }
    if (crowd.source !== 'missing') {
      odds.push(Object.freeze({ game: game.id, odds: crowd }));
    }
    const round = season.round(game.round);
    if (round === undefined) {
      throw new Error('recalculateTournament: a game outside its season');
    }
    for (const prediction of votes) {
      const points = scoreMatch(prediction, game, round, crowd);
      if (points !== null) {
        scored.push({ player: prediction.player, game: game.id, points });
      }
    }
  }

  // The serija, per player, over every game with a result.
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
  const matches = scored.map((row) =>
    Object.freeze({
      ...row,
      serija: bonusAt.get(idKey(row.player, row.game)) ?? Points.ZERO,
    }),
  );

  const survival = survivalPoints(inputs.survival, season, rules);
  if (!survival.ok) {
    return survival;
  }

  const standings = scoreStandings(inputs.standings, inputs.outcomes, rules);

  return ok(
    Object.freeze({
      odds: Object.freeze(odds),
      matches: Object.freeze(matches),
      standings,
      survival: survival.value,
      totals: totalsOf(inputs.players, matches, standings, survival.value),
    }),
  );
}

function survivalPoints(
  source: SurvivalSource,
  season: Season,
  rules: RuleSet,
): Result<
  readonly SurvivalPoints[],
  | 'survival-scored-from-picks'
  | 'survival-row-in-unknown-round'
  | 'survival-row-id-twice'
> {
  if (source.from === 'picks') {
    const rows: SurvivalPoints[] = [];
    for (const [player, run] of source.runs) {
      const scored = rules.survivalScoredFromStoredRows
        ? refoldAtEntry(
            player,
            survivalAtResultEntry(run.picks, season.games),
            season,
            rules,
          )
        : foldSurvival(run.picks, season.games).map((row) =>
            Object.freeze({
              player,
              round: row.round,
              team: row.team,
              points: row.points,
              provisional: row.provisional,
              storedId: null,
            }),
          );
      rows.push(...scored);
    }
    return ok(Object.freeze(rows));
  }
  if (!rules.survivalScoredFromStoredRows) {
    return refuse('survival-scored-from-picks');
  }
  if (new Set(source.rows.map((row) => row.id)).size !== source.rows.length) {
    return refuse('survival-row-id-twice');
  }
  if (source.rows.some((row) => season.round(row.round) === undefined)) {
    return refuse('survival-row-in-unknown-round');
  }
  const refolded = refold(source.rows, season, rules);
  const rows = source.rows
    .map((row) =>
      Object.freeze({
        player: row.player,
        round: row.round,
        team: row.team,
        points: refolded.get(row.id) ?? null,
        provisional: false,
        storedId: row.id,
      }),
    )
    .sort(byPlayerThenRound(source.rows.map((row) => row.player)));
  return ok(Object.freeze(rows));
}

/**
 * sportbet's two survival passes in turn, from one player's pick history:
 * the rows its result entries stored (a pending pick stores none yet), then
 * the full recalculation's refold of them (SU-10).
 */
function refoldAtEntry(
  player: PlayerId,
  atEntry: readonly SurvivalRow[],
  season: Season,
  rules: RuleSet,
): readonly SurvivalPoints[] {
  const stored = atEntry.flatMap((row, index) =>
    row.points === null
      ? []
      : [
          {
            id: index,
            player,
            round: row.round,
            team: row.team,
            storedPoints: row.points,
          },
        ],
  );
  const refolded = refold(stored, season, rules);
  return atEntry.map((row, index) =>
    Object.freeze({
      player,
      round: row.round,
      team: row.team,
      points: refolded.get(index) ?? null,
      provisional: false,
      storedId: null,
    }),
  );
}

/** SU-10's refold, each row joined with its team's game in its round. */
function refold(
  rows: readonly StoredSurvivalRow[],
  season: Season,
  rules: RuleSet,
): ReadonlyMap<number, Points> {
  const games = [...season.games].sort(byTipOffThenId);
  const joined: JoinedSurvivalRow[] = rows.map((row) => ({
    ...row,
    awayTeam:
      games.find((game) => game.round === row.round && game.plays(row.team))
        ?.away ?? null,
  }));
  const refolded = refoldStoredSurvival(joined, rules);
  if (!refolded.ok) {
    // Ids are unique and each row joins one game, so no id has two rows.
    throw new Error(`recalculateTournament: ${refolded.refusal}`);
  }
  return new Map(refolded.value.map((row) => [row.id, row.points]));
}

function byPlayerThenRound(
  order: readonly PlayerId[],
): (a: SurvivalPoints, b: SurvivalPoints) => number {
  const position = new Map<PlayerId, number>();
  for (const player of order) {
    if (!position.has(player)) position.set(player, position.size);
  }
  return (a, b) =>
    (position.get(a.player) ?? 0) - (position.get(b.player) ?? 0) ||
    a.round - b.round;
}

function totalsOf(
  players: readonly PlayerId[],
  matches: readonly MatchRow[],
  standings: readonly StandingsRow[],
  survival: readonly SurvivalPoints[],
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
  for (const row of matches) {
    const total = of(row.player);
    total.match = total.match.plus(row.points.full);
    total.serija = total.serija.plus(row.serija);
  }
  for (const row of standings) {
    const total = of(row.player);
    for (const line of [row.place, row.playOffs, row.finalFour, row.final]) {
      if (line.points !== null) {
        total.standings = total.standings.plus(line.points);
      }
    }
  }
  for (const row of survival) {
    const total = of(row.player);
    if (row.points !== null) {
      total.survival = total.survival.plus(row.points);
    }
  }
  return Object.freeze(
    [...totals].map(([player, total]) => Object.freeze({ player, ...total })),
  );
}
