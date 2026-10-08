import { playerOf } from '@sportbet/db';
import {
  sportbetColumns,
  type GameId,
  type GameOdds,
  type PlayerId,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type TeamId,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { SportbetRow } from '../read-columns';
import type { RefusedPoints } from './types';
import {
  copiesByKey,
  firstBlocked,
  PerTournament,
  playerKey,
  unloaded,
  type MapContext,
} from './ledger';
import type {
  CopyGuard,
  Parents,
  PredictionRow,
  StandingsPickRow,
} from './player-rows';

// Production's own points rows - the parity oracle - and the keys the
// parity checker cannot compare.

export interface MatchPointsRow {
  readonly user: number;
  readonly row: StoredMatchRow;
}

/**
 * sportbet's /leaderboard sums every tournament; the parity run compares
 * it over the Euroleague ones it loads. How many rows that leaves out,
 * numbers only.
 */
function noticeOutsideEuroleague(ctx: MapContext, parents: Parents): void {
  const outside = ctx.rows.point_results.filter((row) => {
    const fate = parents.games.fates.get(row.game_id);
    return fate?.kind === 'skipped' && fate.reason === 'not-euroleague';
  }).length;
  ctx.notices.push(
    `point_results outside Euroleague: ${String(outside)} rows, on sportbet's /leaderboard but not compared`,
  );
}

/** point_results: production's match points. */
export function mapMatchPoints(
  ctx: MapContext,
  parents: Parents,
  copies: CopyGuard,
): PerTournament<MatchPointsRow> {
  const { ledger } = ctx;
  const matchPoints = new PerTournament<MatchPointsRow>();
  const found = copiesByKey(ctx.rows.point_results, (row) =>
    playerKey(row.user_id, row.game_id),
  );
  noticeOutsideEuroleague(ctx, parents);
  for (const row of ctx.rows.point_results) {
    const where = `game ${String(row.game_id)}`;
    const blocked = firstBlocked([
      parents.games.fates.get(row.game_id),
      parents.users.fates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_results', blocked.fate, where);
      continue;
    }
    const key = playerKey(row.user_id, row.game_id);
    if (copies.refused('point_results', found, key, where)) continue;
    const game = parents.games.games.get(row.game_id);
    if (game === undefined) {
      throw new ReaderProblem('map: a loaded game is missing');
    }
    const mapped = sportbetColumns.matchPointsRow({
      ...row,
      player: playerOf(row.user_id),
      game: game.game.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_results', mapped.refusal, where);
      continue;
    }
    matchPoints.add(game.tournament, { user: row.user_id, row: mapped.value });
    ledger.load('point_results');
  }
  return matchPoints;
}

export interface StandingsPointsRow {
  readonly user: number;
  readonly row: StandingsRow;
}

/** point_standings: production's standings points. */
export function mapStandingsPoints(
  ctx: MapContext,
  parents: Parents,
  copies: CopyGuard,
): PerTournament<StandingsPointsRow> {
  const { ledger } = ctx;
  const standingsPoints = new PerTournament<StandingsPointsRow>();
  const found = copiesByKey(ctx.rows.point_standings, (row) =>
    playerKey(row.user_id, row.team_id),
  );
  for (const row of ctx.rows.point_standings) {
    const where = `team ${String(row.team_id)}`;
    const blocked = firstBlocked([
      parents.teams.fates.get(row.team_id),
      parents.users.fates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_standings', blocked.fate, where);
      continue;
    }
    const key = playerKey(row.user_id, row.team_id);
    if (copies.refused('point_standings', found, key, where)) continue;
    const team = parents.teams.teams.get(row.team_id);
    if (team === undefined) {
      throw new ReaderProblem('map: a loaded team is missing');
    }
    const mapped = sportbetColumns.standingsPointsRow({
      ...row,
      player: playerOf(row.user_id),
      team: team.row.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_standings', mapped.refusal, where);
      continue;
    }
    standingsPoints.add(team.tournament, {
      user: row.user_id,
      row: mapped.value,
    });
    ledger.load('point_standings');
  }
  return standingsPoints;
}

export interface SurvivalPointsRow {
  readonly user: number;
  readonly row: SurvivalPoints;
}

/** One stored survival row through its round and team, or null (counted). */
function survivalPointsOf(
  ctx: MapContext,
  parents: Parents,
  row: SportbetRow<'point_survivals'>,
): { tournament: number; row: SurvivalPoints } | null {
  const { ledger } = ctx;
  const where = `event ${String(row.event_id)}`;
  const blocked = firstBlocked([
    parents.rounds.fates.get(row.event_id),
    parents.teams.fates.get(row.team_id),
    parents.users.fates.get(row.user_id),
  ]);
  if (blocked !== null) {
    ledger.follow('point_survivals', blocked.fate, where);
    return null;
  }
  const round = parents.rounds.rounds.get(row.event_id);
  const team = parents.teams.teams.get(row.team_id);
  if (round === undefined || team === undefined) {
    throw new ReaderProblem('map: a loaded survival parent is missing');
  }
  if (team.tournament !== round.tournament) {
    ledger.refuse('point_survivals', 'cross-tournament', where);
    return null;
  }
  const mapped = sportbetColumns.survivalRow({
    ...row,
    player: playerOf(row.user_id),
    event_day: round.number,
    team: team.row.id,
  });
  if (!mapped.ok) {
    ledger.refuse('point_survivals', mapped.refusal, where);
    return null;
  }
  // A production row is the stored row itself: its stored id is its own.
  return {
    tournament: round.tournament,
    row: {
      player: mapped.value.player,
      round: mapped.value.round,
      team: mapped.value.team,
      points: mapped.value.storedPoints,
      provisional: false,
      storedId: mapped.value.id,
    },
  };
}

/** point_survivals: production's stored survival rows, by sportbet id. */
export function mapSurvivalPoints(
  ctx: MapContext,
  parents: Parents,
): PerTournament<SurvivalPointsRow> {
  const survivalPoints = new PerTournament<SurvivalPointsRow>();
  for (const row of ctx.rows.point_survivals) {
    const mapped = survivalPointsOf(ctx, parents, row);
    if (mapped === null) continue;
    survivalPoints.add(mapped.tournament, {
      user: row.user_id,
      row: mapped.row,
    });
    ctx.ledger.load('point_survivals');
  }
  return survivalPoints;
}

/** Every points-related row a tournament loaded, by kind. */
export interface LoadedRows {
  readonly odds: PerTournament<GameOdds>;
  readonly predictions: PerTournament<PredictionRow>;
  readonly standings: PerTournament<StandingsPickRow>;
  readonly matchPoints: PerTournament<MatchPointsRow>;
  readonly standingsPoints: PerTournament<StandingsPointsRow>;
  readonly survivalPoints: PerTournament<SurvivalPointsRow>;
}

const matchKey = (key: { player: PlayerId; game: GameId }): string =>
  `${key.player}/${String(key.game)}`;
const standingKey = (key: { player: PlayerId; team: TeamId }): string =>
  `${key.player}/${key.team}`;

/** What every key of one tournament is read against. */
interface KeysOf {
  readonly ctx: MapContext;
  readonly parents: Parents;
  readonly loaded: LoadedRows;
  readonly id: number;
}

/** The tournament's prediction and points keys of players' games, not loaded. */
function refusedMatches(of: KeysOf): RefusedPoints['matches'] {
  const { ctx, parents, loaded, id } = of;
  const matchOf = (row: { user_id: number; game_id: number }) => {
    const game = parents.games.games.get(row.game_id);
    return game?.tournament === id && parents.users.users.has(row.user_id)
      ? { player: playerOf(row.user_id), game: game.game.id }
      : null;
  };
  return [
    ...unloaded(
      ctx.rows.prediction_results.map(matchOf),
      loaded.predictions.of(id).map(({ prediction }) => prediction),
      matchKey,
    ),
    ...unloaded(
      ctx.rows.point_results.map(matchOf),
      loaded.matchPoints.of(id).map(({ row }) => row),
      matchKey,
    ),
  ];
}

/** The tournament's standings and standings points keys, not loaded. */
function refusedStandings(of: KeysOf): RefusedPoints['standings'] {
  const { ctx, parents, loaded, id } = of;
  const standingOf = (row: { user_id: number; team_id: number }) => {
    const team = parents.teams.teams.get(row.team_id);
    return team?.tournament === id && parents.users.users.has(row.user_id)
      ? { player: playerOf(row.user_id), team: team.row.id }
      : null;
  };
  return [
    ...unloaded(
      ctx.rows.prediction_standings.map(standingOf),
      loaded.standings.of(id).map(({ user, pick }) => ({
        player: playerOf(user),
        team: pick.team,
      })),
      standingKey,
    ),
    ...unloaded(
      ctx.rows.point_standings.map(standingOf),
      loaded.standingsPoints.of(id).map(({ row }) => row),
      standingKey,
    ),
  ];
}

/**
 * The keys of tournament `id` the parity checker cannot compare
 * (RefusedPoints): a row whose parents loaded, not loaded itself.
 */
export function refusedPointsOf(
  ctx: MapContext,
  parents: Parents,
  loaded: LoadedRows,
  id: number,
): RefusedPoints {
  const { rows } = ctx;
  const { games, teams, rounds, users } = parents;
  const of: KeysOf = { ctx, parents, loaded, id };
  return {
    matches: refusedMatches(of),
    standings: refusedStandings(of),
    survival: unloaded(
      rows.point_survivals.map((row) =>
        rounds.rounds.get(row.event_id)?.tournament === id &&
        teams.teams.has(row.team_id) &&
        users.users.has(row.user_id)
          ? row.id
          : null,
      ),
      loaded.survivalPoints.of(id).flatMap(({ row }) => row.storedId ?? []),
      String,
    ),
    odds: unloaded(
      rows.game_odds.map((row) => {
        const game = games.games.get(row.game_id);
        return game?.tournament === id ? game.game.id : null;
      }),
      loaded.odds.of(id).map(({ game }) => game),
      String,
    ),
  };
}
