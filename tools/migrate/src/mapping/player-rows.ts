import { playerOf } from '@sportbet/db';
import {
  MatchPrediction,
  sportbetColumns,
  StandingsPrediction,
  type StoredTeamPick,
  type SurvivalPick,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { SportbetRow, SportbetTable } from '../read-columns';
import {
  copiesByKey,
  firstBlocked,
  PerTournament,
  playerKey,
  type GameEntry,
  type MapContext,
  type TeamEntry,
} from './ledger';
import type { MappedSettings, MappedUsers } from './accounts';
import type { MappedGames, MappedRounds, MappedTeams } from './structure';

// The players' own rows: their predictions, standings predictions and
// survival picks.

/** The rows a player's row depends on, as mapped so far. */
export interface Parents {
  readonly rounds: MappedRounds;
  readonly teams: MappedTeams;
  readonly games: MappedGames;
  readonly users: MappedUsers;
}

/**
 * Rows sharing one player's key (a game or a team) are all refused, as
 * which one sportbet used cannot be known: its crowd odds count every
 * copy, its points follow MySQL's fetch order (the owner, 2026-10-01:
 * refuse, report, never guess). Each key is noticed once.
 */
export class CopyGuard {
  readonly #noticed = new Set<string>();
  readonly #ctx: MapContext;

  constructor(ctx: MapContext) {
    this.#ctx = ctx;
  }

  /** True, and the row refused, when its key has copies. */
  refused(
    table: SportbetTable,
    copies: ReadonlyMap<string, number>,
    key: string,
    where: string,
  ): boolean {
    const count = copies.get(key) ?? 0;
    if (count < 2) return false;
    this.#ctx.ledger.refuse(table, 'duplicate-key', where);
    if (!this.#noticed.has(`${table} ${key}`)) {
      this.#noticed.add(`${table} ${key}`);
      this.#ctx.notices.push(
        `${table}: ${where} has ${String(count)} rows of one player; all are refused, as which one sportbet used cannot be known`,
      );
    }
    return true;
  }
}

export interface PredictionRow {
  readonly user: number;
  readonly prediction: MatchPrediction;
}

/** One prediction row through its game, as a stored prediction, or why not. */
function predictionOf(row: SportbetRow<'prediction_results'>, game: GameEntry) {
  if (row.game_winner_id !== null) {
    return { ok: false as const, refusal: 'football-column-set' };
  }
  const mapped = sportbetColumns.prediction({
    ...row,
    player: playerOf(row.user_id),
    game: game.game.id,
  });
  return mapped.ok ? MatchPrediction.stored(mapped.value) : mapped;
}

/** prediction_results: each player's match predictions. */
export function mapPredictions(
  ctx: MapContext,
  parents: Parents,
  copies: CopyGuard,
): PerTournament<PredictionRow> {
  const { ledger } = ctx;
  const predictions = new PerTournament<PredictionRow>();
  const found = copiesByKey(ctx.rows.prediction_results, (row) =>
    playerKey(row.user_id, row.game_id),
  );
  for (const row of ctx.rows.prediction_results) {
    const where = `game ${String(row.game_id)}`;
    const blocked = firstBlocked([
      parents.games.fates.get(row.game_id),
      parents.users.fates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_results', blocked.fate, where);
      continue;
    }
    const key = playerKey(row.user_id, row.game_id);
    if (copies.refused('prediction_results', found, key, where)) continue;
    const game = parents.games.games.get(row.game_id);
    if (game === undefined) {
      throw new ReaderProblem('map: a loaded game is missing');
    }
    const prediction = predictionOf(row, game);
    if (!prediction.ok) {
      ledger.refuse('prediction_results', prediction.refusal, where);
      continue;
    }
    predictions.add(game.tournament, {
      user: row.user_id,
      prediction: prediction.value,
    });
    ledger.load('prediction_results');
  }
  return predictions;
}

export interface StandingsPickRow {
  readonly user: number;
  readonly pick: StoredTeamPick;
}

/**
 * P2: a final of 0 loads as no final place. Counted over loaded rows, and
 * per team whether an active player put it at 0 or at 1 to 4.
 */
class FinalZeros {
  rows = 0;
  readonly #byTeam = new Map<number, { zero: boolean; placed: boolean }>();

  count(row: SportbetRow<'prediction_standings'>, active: boolean): void {
    if (row.final === 0) this.rows += 1;
    if (!active || row.final === null) return;
    const finals = this.#byTeam.get(row.team_id) ?? {
      zero: false,
      placed: false,
    };
    if (row.final === 0) finals.zero = true;
    if (row.final >= 1 && row.final <= 4) finals.placed = true;
    this.#byTeam.set(row.team_id, finals);
  }

  zeroOnlyTeams(): number {
    return [...this.#byTeam.values()].filter(
      ({ zero, placed }) => zero && !placed,
    ).length;
  }
}

/** One standings row through its team, checked as a stored pick, or why not. */
function standingsPickOf(
  row: SportbetRow<'prediction_standings'>,
  team: TeamEntry,
) {
  if (row.last16 !== null || row.last32 !== null) {
    return { ok: false as const, refusal: 'football-column-set' };
  }
  const pick = sportbetColumns.teamPick({ ...row, team: team.row.id });
  const checked = StandingsPrediction.stored(playerOf(row.user_id), [pick]);
  return checked.ok ? { ok: true as const, value: pick } : checked;
}

/** prediction_standings: each player's standings rows, and P2's notice. */
export function mapStandingsPredictions(
  ctx: MapContext,
  parents: Parents & {
    readonly settings: MappedSettings;
    /** Whether any tournament loaded: P2's notice only then. */
    readonly anyTournament: boolean;
  },
  copies: CopyGuard,
): PerTournament<StandingsPickRow> {
  const { ledger } = ctx;
  const standings = new PerTournament<StandingsPickRow>();
  const found = copiesByKey(ctx.rows.prediction_standings, (row) =>
    playerKey(row.user_id, row.team_id),
  );
  const zeros = new FinalZeros();
  for (const row of ctx.rows.prediction_standings) {
    const where = `team ${String(row.team_id)}`;
    const blocked = firstBlocked([
      parents.teams.fates.get(row.team_id),
      parents.users.fates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_standings', blocked.fate, where);
      continue;
    }
    const key = playerKey(row.user_id, row.team_id);
    if (copies.refused('prediction_standings', found, key, where)) continue;
    const team = parents.teams.teams.get(row.team_id);
    if (team === undefined) {
      throw new ReaderProblem('map: a loaded team is missing');
    }
    const pick = standingsPickOf(row, team);
    if (!pick.ok) {
      ledger.refuse('prediction_standings', pick.refusal, where);
      continue;
    }
    zeros.count(row, parents.settings.active.get(row.user_id) === true);
    standings.add(team.tournament, { user: row.user_id, pick: pick.value });
    ledger.load('prediction_standings');
  }
  if (parents.anyTournament) {
    ctx.notices.push(
      `prediction_standings: ${String(zeros.rows)} rows hold final 0, loaded as no final place; ${String(zeros.zeroOnlyTeams())} teams have only such finals among active players, which sportbet's medal count lists with zeros and the hub's does not (P2)`,
    );
  }
  return standings;
}

export interface SurvivalPickRow {
  readonly user: number;
  readonly pick: SurvivalPick;
}

/** prediction_survivals: a pick has an event; a seeded slot has none. */
export function mapSurvivalPicks(
  ctx: MapContext,
  parents: Parents,
): PerTournament<SurvivalPickRow> {
  const { ledger } = ctx;
  const picks = new PerTournament<SurvivalPickRow>();
  const pickedRounds = new Set<string>();
  for (const row of ctx.rows.prediction_survivals) {
    if (row.event_id === null) {
      // A slot of a football tournament's team is skipped as football.
      const parent = parents.teams.fates.get(row.team_id);
      ledger.skip(
        'prediction_survivals',
        parent?.kind === 'skipped'
          ? parent.reason
          : 'seeded-slot-without-event',
      );
      continue;
    }
    const pick = survivalPickOf(ctx, parents, {
      ...row,
      event_id: row.event_id,
    });
    if (pick === null) continue;
    const key = `${String(row.user_id)}/${String(row.event_id)}`;
    if (pickedRounds.has(key)) {
      ledger.refuse(
        'prediction_survivals',
        'two-picks-in-one-round',
        `event ${String(row.event_id)}`,
      );
      continue;
    }
    pickedRounds.add(key);
    picks.add(pick.tournament, { user: row.user_id, pick: pick.pick });
    ledger.load('prediction_survivals');
  }
  return picks;
}

/** One pick row with an event, as a pick of its round, or null (counted). */
function survivalPickOf(
  ctx: MapContext,
  parents: Parents,
  row: SportbetRow<'prediction_survivals'> & { readonly event_id: number },
): { tournament: number; pick: SurvivalPick } | null {
  const { ledger } = ctx;
  const where = `event ${String(row.event_id)}`;
  const blocked = firstBlocked([
    parents.rounds.fates.get(row.event_id),
    parents.teams.fates.get(row.team_id),
    parents.users.fates.get(row.user_id),
  ]);
  if (blocked !== null) {
    ledger.follow('prediction_survivals', blocked.fate, where);
    return null;
  }
  const round = parents.rounds.rounds.get(row.event_id);
  const team = parents.teams.teams.get(row.team_id);
  if (round === undefined || team === undefined) {
    throw new ReaderProblem('map: a loaded pick parent is missing');
  }
  if (team.tournament !== round.tournament) {
    ledger.refuse('prediction_survivals', 'cross-tournament', where);
    return null;
  }
  const pick = sportbetColumns.survivalPick({
    team: team.row.id,
    event_day: round.number,
  });
  if (!pick.ok) {
    ledger.refuse('prediction_survivals', pick.refusal, where);
    return null;
  }
  return { tournament: round.tournament, pick: pick.value };
}
