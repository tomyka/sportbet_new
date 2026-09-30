import {
  gameOf,
  inputReadsOf,
  playerOf,
  teamOf,
  type SavedRound,
  type TeamRow,
  type TournamentPlayer,
} from '@sportbet/db';
import {
  Game,
  instantFrom,
  LAST_REGULAR_SEASON_ROUND,
  MatchPrediction,
  PlayerStatus,
  Round,
  ruledRules,
  sportbetColumns,
  sportbetRules,
  StandingsPrediction,
  SurvivalRun,
  TeamOutcomes,
  tournamentId,
  type GameOdds,
  type PlayerId,
  type PointsRows,
  type Result,
  type RuleSet,
  type RoundNumber,
  type StandingsRow,
  type StoredMatchRow,
  type StoredPlayer,
  type StoredTeamPick,
  type SurvivalPick,
  type SurvivalPoints,
  type TeamOutcome,
  type Tournament,
} from '@sportbet/domain';
import { ReaderProblem } from './problem';
import {
  SPORTBET_TABLES,
  type SportbetRows,
  type SportbetTable,
} from './read-columns';

/** One tournament's rows, mapped through sportbetColumns and the stored factories. */
export interface MappedTournament {
  readonly tournament: Tournament;
  readonly teams: readonly TeamRow[];
  readonly rounds: readonly SavedRound[];
  readonly games: readonly Game[];
  readonly outcomes: TeamOutcomes;
  readonly players: readonly TournamentPlayer[];
  readonly predictions: readonly MatchPrediction[];
  readonly standings: readonly StandingsPrediction[];
  readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
  /** Production's own points rows: the parity oracle, and an input. */
  readonly production: PointsRows;
}

/**
 * A row not loaded, and why. `row` names it without personal data: the
 * sportbet id of a row no player owns (`id 7`), the game, team or event a
 * player's row belongs to (`game 7`), or nothing at all.
 */
export interface Refusal {
  readonly reason: string;
  readonly row: string;
}

/** One sportbet table's reconciliation: read = loaded + skipped + refused. */
export interface TableCount {
  readonly table: SportbetTable;
  readonly read: number;
  readonly loaded: number;
  readonly skipped: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
  readonly refusals: readonly Refusal[];
}

export interface Mapped {
  /** Every loaded player: the id and the username only. */
  readonly players: readonly StoredPlayer[];
  readonly tournaments: readonly MappedTournament[];
  readonly tables: readonly TableCount[];
  /** Quirks that were loaded as they are, each worth knowing about. */
  readonly notices: readonly string[];
}

/** What became of a row other rows depend on. */
type Fate =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

const LOADED: Fate = Object.freeze({ kind: 'loaded' });

class Ledger {
  readonly #counts = new Map<
    SportbetTable,
    {
      read: number;
      loaded: number;
      skipped: Map<string, number>;
      refused: Map<string, number>;
      refusals: Refusal[];
    }
  >();

  constructor(rows: SportbetRows) {
    for (const table of SPORTBET_TABLES) {
      this.#counts.set(table, {
        read: rows[table].length,
        loaded: 0,
        skipped: new Map(),
        refused: new Map(),
        refusals: [],
      });
    }
  }

  #of(table: SportbetTable) {
    const count = this.#counts.get(table);
    if (count === undefined) throw new ReaderProblem(`map: no table ${table}`);
    return count;
  }

  load(table: SportbetTable): void {
    this.#of(table).loaded += 1;
  }

  skip(table: SportbetTable, reason: string): void {
    const { skipped } = this.#of(table);
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  }

  refuse(table: SportbetTable, reason: string, row = ''): void {
    const count = this.#of(table);
    count.refused.set(reason, (count.refused.get(reason) ?? 0) + 1);
    count.refusals.push({ reason, row });
  }

  /**
   * Follows a row's parent: an unknown parent makes it an orphan, a parent
   * skipped by design skips it for the same reason, and a refused parent
   * refuses it with the reason it inherits. True when the parent is loaded.
   */
  follow(
    table: SportbetTable,
    parent: Fate | undefined,
    row: string,
  ): parent is { readonly kind: 'loaded' } {
    if (parent === undefined) {
      this.refuse(table, 'orphan', row);
      return false;
    }
    switch (parent.kind) {
      case 'loaded':
        return true;
      case 'skipped':
        this.skip(table, parent.reason);
        return false;
      case 'refused':
        this.refuse(table, dependsOn(parent.reason), row);
        return false;
    }
  }

  tables(): TableCount[] {
    return SPORTBET_TABLES.map((table) => {
      const count = this.#of(table);
      return {
        table,
        read: count.read,
        loaded: count.loaded,
        skipped: Object.fromEntries(count.skipped),
        refused: Object.fromEntries(count.refused),
        refusals: count.refusals,
      };
    });
  }
}

/** A refusal a row inherits from the row it depends on, named once. */
const dependsOn = (reason: string) =>
  reason.startsWith('depends-on-refused')
    ? reason
    : `depends-on-refused (${reason})`;

const refused = (reason: string): Fate => ({ kind: 'refused', reason });
const skipped = (reason: string): Fate => ({ kind: 'skipped', reason });

/** An id the domain always accepts for a positive sportbet id. */
function must<T, R extends string>(result: Result<T, R>, what: string): T {
  if (!result.ok) throw new ReaderProblem(`map: ${what}: ${result.refusal}`);
  return result.value;
}

/** sportbet's `game_date` (UTC, `YYYY-MM-DD HH:MM:SS`) as an instant. */
const tipOffOf = (gameDate: string) =>
  instantFrom(`${gameDate.replace(' ', 'T')}Z`);

interface RoundRow {
  readonly tournament: number;
  readonly number: RoundNumber;
  readonly saved: SavedRound;
}
interface TeamEntry {
  readonly tournament: number;
  readonly row: TeamRow;
  readonly outcome: TeamOutcome;
}
interface GameEntry {
  readonly tournament: number;
  readonly game: Game;
}

/** Rows grouped per loaded tournament, as they are mapped. */
class PerTournament<T> {
  readonly #rows = new Map<number, T[]>();

  add(tournament: number, row: T): void {
    this.#rows.set(tournament, [...(this.#rows.get(tournament) ?? []), row]);
  }

  of(tournament: number): readonly T[] {
    return this.#rows.get(tournament) ?? [];
  }
}

/**
 * Maps sportbet's read rows to the domain's stored rows, and reconciles
 * every table: each row is loaded, skipped by design (a football
 * tournament's, a seeded survival slot, a user in no loaded tournament) or
 * refused with a reason. Every value goes through sportbetColumns and then
 * the domain's stored factory, and nothing is mapped anywhere else. Pure:
 * no I/O, so every quirk has a unit test.
 *
 * A user whose user_settings cannot be read (no row, or rows that differ)
 * is refused only if they play a loaded tournament; any other user is
 * skipped with their rows. Whether a user plays depends on their own rows
 * alone, so a first pass, which keeps every such user, finds the ones who
 * play, and the second refuses exactly those.
 */
export function mapSportbet(rows: SportbetRows): Mapped {
  const tentative = mapWith(rows, new Set());
  const final = mapWith(rows, new Set(tentative.unsettledPlayers));
  if (final.unsettledPlayers.length > 0) {
    throw new ReaderProblem('map: a player has no readable user_settings');
  }
  return final.mapped;
}

/**
 * One pass of mapSportbet. A user in `refuseUnsettled` whose
 * user_settings cannot be read is refused; any other such user is kept,
 * and returned in `unsettledPlayers` if they play a loaded tournament.
 */
function mapWith(
  rows: SportbetRows,
  refuseUnsettled: ReadonlySet<number>,
): { readonly mapped: Mapped; readonly unsettledPlayers: readonly number[] } {
  const ledger = new Ledger(rows);
  const notices: string[] = [];

  // tournaments
  const tournamentFates = new Map<number, Fate>();
  const tournaments = new Map<number, Tournament>();
  for (const row of rows.tournaments) {
    const mapped = sportbetColumns.tournament(row);
    if (mapped.ok) {
      tournaments.set(row.id, mapped.value);
      tournamentFates.set(row.id, LOADED);
      ledger.load('tournaments');
    } else if (mapped.refusal === 'format-not-ported') {
      tournamentFates.set(row.id, skipped('not-euroleague'));
      ledger.skip('tournaments', 'not-euroleague');
    } else {
      tournamentFates.set(row.id, refused(mapped.refusal));
      ledger.refuse('tournaments', mapped.refusal, `id ${String(row.id)}`);
    }
  }
  if (tournaments.size > 0) {
    notices.push(
      'tournaments: sportbet does not record whether its standings table is final (R-14); every tournament is loaded with it not final',
    );
  }

  // events: the rounds
  const eventFates = new Map<number, Fate>();
  const rounds = new Map<number, RoundRow>();
  const roundNumbers = new Set<string>();
  for (const row of rows.events) {
    const where = `id ${String(row.id)}`;
    const fate = (to: Fate) => eventFates.set(row.id, to);
    const parent = tournamentFates.get(row.tournament_id);
    if (!ledger.follow('events', parent, where)) {
      fate(parent === undefined ? refused('orphan') : inherit(parent));
      continue;
    }
    // sportbet stores no stage: a round after the regular season's last is
    // one whose stage cannot be read.
    if (row.event_day > LAST_REGULAR_SEASON_ROUND) {
      fate(refused('stage-unknown'));
      ledger.refuse('events', 'stage-unknown', where);
      continue;
    }
    const mapped = sportbetColumns.round({ ...row, stage: 'regular' });
    if (!mapped.ok) {
      fate(refused(mapped.refusal));
      ledger.refuse('events', mapped.refusal, where);
      continue;
    }
    const key = `${String(row.tournament_id)}/${String(mapped.value.number)}`;
    if (roundNumbers.has(key)) {
      fate(refused('duplicate-key'));
      ledger.refuse('events', 'duplicate-key', where);
      continue;
    }
    roundNumbers.add(key);
    rounds.set(row.id, {
      tournament: row.tournament_id,
      number: mapped.value.number,
      saved: { id: row.id, name: row.event, round: Round.stored(mapped.value) },
    });
    fate(LOADED);
    ledger.load('events');
  }

  // teams, and their outcomes
  const teamFates = new Map<number, Fate>();
  const teams = new Map<number, TeamEntry>();
  for (const row of rows.teams) {
    const where = `id ${String(row.id)}`;
    const fate = (to: Fate) => teamFates.set(row.id, to);
    const parent = tournamentFates.get(row.tournament_id);
    if (!ledger.follow('teams', parent, where)) {
      fate(parent === undefined ? refused('orphan') : inherit(parent));
      continue;
    }
    if (row.last16 !== null || row.last32 !== null) {
      fate(refused('football-column-set'));
      ledger.refuse('teams', 'football-column-set', where);
      continue;
    }
    const outcome = sportbetColumns.teamOutcome({
      ...row,
      team: teamOf(row.id),
    });
    if (!outcome.ok) {
      fate(refused(outcome.refusal));
      ledger.refuse('teams', outcome.refusal, where);
      continue;
    }
    const shape = TeamOutcomes.stored([outcome.value], false);
    if (!shape.ok) {
      fate(refused(shape.refusal));
      ledger.refuse('teams', shape.refusal, where);
      continue;
    }
    teams.set(row.id, {
      tournament: row.tournament_id,
      row: { id: teamOf(row.id), name: row.team },
      outcome: outcome.value,
    });
    fate(LOADED);
    ledger.load('teams');
  }

  // games
  const gameFates = new Map<number, Fate>();
  const games = new Map<number, GameEntry>();
  const pairings = new Set<string>();
  for (const row of rows.games) {
    const where = `id ${String(row.id)}`;
    const fate = (to: Fate) => gameFates.set(row.id, to);
    const parents = [
      eventFates.get(row.event_id),
      teamFates.get(row.home_team_id),
      teamFates.get(row.away_team_id),
    ];
    const blocked = firstBlocked(parents);
    if (blocked !== null) {
      ledger.follow('games', blocked.fate, where);
      fate(
        blocked.fate === undefined ? refused('orphan') : inherit(blocked.fate),
      );
      continue;
    }
    const round = rounds.get(row.event_id);
    const home = teams.get(row.home_team_id);
    const away = teams.get(row.away_team_id);
    if (round === undefined || home === undefined || away === undefined) {
      throw new ReaderProblem('map: a loaded game parent is missing');
    }
    if (
      home.tournament !== round.tournament ||
      away.tournament !== round.tournament
    ) {
      fate(refused('cross-tournament'));
      ledger.refuse('games', 'cross-tournament', where);
      continue;
    }
    const tipOff = tipOffOf(row.game_date);
    if (!tipOff.ok) {
      fate(refused(tipOff.refusal));
      ledger.refuse('games', tipOff.refusal, where);
      continue;
    }
    const mapped = sportbetColumns.game({
      id: gameOf(row.id),
      round: round.number,
      home: home.row.id,
      away: away.row.id,
      tipOff: tipOff.value,
      home_team_score: row.home_team_score,
      away_team_score: row.away_team_score,
      game_winner_id:
        row.game_winner_id === null ? null : teamOf(row.game_winner_id),
    });
    const game = mapped.ok ? Game.stored(mapped.value) : mapped;
    if (!game.ok) {
      fate(refused(game.refusal));
      ledger.refuse('games', game.refusal, where);
      continue;
    }
    const pairing = `${String(row.event_id)}/${String(row.home_team_id)}/${String(row.away_team_id)}`;
    if (pairings.has(pairing)) {
      fate(refused('duplicate-key'));
      ledger.refuse('games', 'duplicate-key', where);
      continue;
    }
    pairings.add(pairing);
    games.set(row.id, { tournament: round.tournament, game: game.value });
    fate(LOADED);
    ledger.load('games');
  }

  // game_odds: sportbet reads first() with no order. Rows equal to each
  // other keep the lowest id; rows that differ refuse the game's odds, as
  // which one sportbet scored with cannot be known.
  const odds = new PerTournament<GameOdds>();
  const oddsOfGame = new Map<
    number,
    { tournament: number; game: Game; rows: { id: number; odds: GameOdds }[] }
  >();
  for (const row of rows.game_odds) {
    const where = `id ${String(row.id)}`;
    if (!ledger.follow('game_odds', gameFates.get(row.game_id), where)) {
      continue;
    }
    const game = games.get(row.game_id);
    if (game === undefined)
      throw new ReaderProblem('map: a loaded game is missing');
    const mapped = sportbetColumns.gameOdds({ ...row, game: game.game.id });
    if (!mapped.ok) {
      ledger.refuse('game_odds', mapped.refusal, where);
      continue;
    }
    const entry = oddsOfGame.get(row.game_id) ?? {
      tournament: game.tournament,
      game: game.game,
      rows: [],
    };
    entry.rows.push({ id: row.id, odds: mapped.value });
    oddsOfGame.set(row.game_id, entry);
  }
  for (const [id, { tournament, game, rows: found }] of oddsOfGame) {
    const [kept, ...extra] = found;
    if (kept === undefined) continue;
    const differ = extra.some(
      (each) =>
        !each.odds.odds.home.equals(kept.odds.odds.home) ||
        !each.odds.odds.away.equals(kept.odds.odds.away) ||
        !each.odds.odds.draw.equals(kept.odds.odds.draw),
    );
    if (differ) {
      for (const each of found) {
        ledger.refuse('game_odds', 'duplicate-key', `id ${String(each.id)}`);
      }
      notices.push(
        `game_odds: game ${String(id)} has ${String(found.length)} rows that differ; all are refused, as which one sportbet scored with cannot be known. ${withoutStoredOdds(game)}`,
      );
      continue;
    }
    odds.add(tournament, kept.odds);
    ledger.load('game_odds');
    extra.forEach(() => {
      ledger.skip('game_odds', 'duplicate-equal');
    });
    if (extra.length > 0) {
      notices.push(
        `game_odds: game ${String(id)} has ${String(found.length)} equal rows; the lowest id is kept, as sportbetColumns documents`,
      );
    }
  }

  // users: the id and the username, nothing else
  const userFates = new Map<number, Fate>();
  const users = new Map<number, StoredPlayer>();
  for (const row of rows.users) {
    const mapped = sportbetColumns.player(row);
    if (mapped.ok) {
      users.set(row.id, mapped.value);
      userFates.set(row.id, LOADED);
    } else {
      userFates.set(row.id, refused(mapped.refusal));
      ledger.refuse('users', mapped.refusal);
    }
  }

  // user_settings: one global switch per user
  const active = new Map<number, boolean>();
  const settingsRows = new Map<number, number[]>();
  for (const row of rows.user_settings) {
    settingsRows.set(row.user_id, [
      ...(settingsRows.get(row.user_id) ?? []),
      row.active,
    ]);
  }
  const settingsFate = new Map<
    number,
    'kept' | 'duplicate' | 'refused' | 'unsettled'
  >();
  // Users kept although their settings cannot be read (refuseUnsettled).
  const unsettled = new Set<number>();
  for (const [user, values] of settingsRows) {
    if (userFates.get(user) === undefined) {
      values.forEach(() => {
        ledger.refuse('user_settings', 'orphan');
      });
      continue;
    }
    if (new Set(values.map((value) => value !== 0)).size > 1) {
      if (!refuseUnsettled.has(user)) {
        unsettled.add(user);
        settingsFate.set(user, 'unsettled');
        continue;
      }
      values.forEach(() => {
        ledger.refuse('user_settings', 'duplicate-key');
      });
      if (userFates.get(user)?.kind === 'loaded') {
        userFates.set(user, refused('duplicate-key'));
        users.delete(user);
        ledger.refuse('users', dependsOn('duplicate-key'));
      }
      settingsFate.set(user, 'refused');
      continue;
    }
    active.set(user, (values[0] ?? 1) !== 0);
    settingsFate.set(user, values.length > 1 ? 'duplicate' : 'kept');
  }
  // A user with no user_settings row: whether they are switched off cannot
  // be read, so the player is refused rather than guessed active.
  for (const [user, fate] of userFates) {
    if (fate.kind === 'loaded' && !active.has(user)) {
      if (!refuseUnsettled.has(user)) {
        unsettled.add(user);
        continue;
      }
      userFates.set(user, refused('player-without-settings'));
      users.delete(user);
      ledger.refuse('users', 'player-without-settings');
    }
  }

  // leagues and league_members: who plays a tournament
  const leagueTournament = new Map<number, number>();
  const leagueFates = new Map<number, Fate>();
  for (const row of rows.leagues) {
    const parent = tournamentFates.get(row.tournament_id);
    const where = `id ${String(row.id)}`;
    if (ledger.follow('leagues', parent, where)) {
      leagueTournament.set(row.id, row.tournament_id);
      leagueFates.set(row.id, LOADED);
      ledger.load('leagues');
    } else {
      leagueFates.set(
        row.id,
        parent === undefined ? refused('orphan') : inherit(parent),
      );
    }
  }
  const members = new PerTournament<number>();
  for (const row of rows.league_members) {
    const blocked = firstBlocked([
      leagueFates.get(row.league_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('league_members', blocked.fate, '');
      continue;
    }
    const tournament = leagueTournament.get(row.league_id);
    if (tournament === undefined)
      throw new ReaderProblem('map: a league is missing');
    members.add(tournament, row.user_id);
    ledger.load('league_members');
  }

  // prediction_results
  const predictions = new PerTournament<{
    user: number;
    prediction: MatchPrediction;
  }>();
  const predicted = new Set<string>();
  for (const row of rows.prediction_results) {
    const where = `game ${String(row.game_id)}`;
    const blocked = firstBlocked([
      gameFates.get(row.game_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_results', blocked.fate, where);
      continue;
    }
    const game = games.get(row.game_id);
    if (game === undefined)
      throw new ReaderProblem('map: a loaded game is missing');
    if (row.game_winner_id !== null) {
      ledger.refuse('prediction_results', 'football-column-set', where);
      continue;
    }
    const mapped = sportbetColumns.prediction({
      ...row,
      player: playerOf(row.user_id),
      game: game.game.id,
    });
    const prediction = mapped.ok
      ? MatchPrediction.stored(mapped.value)
      : mapped;
    if (!prediction.ok) {
      ledger.refuse('prediction_results', prediction.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.game_id)}`;
    if (predicted.has(key)) {
      ledger.refuse('prediction_results', 'duplicate-key', where);
      continue;
    }
    predicted.add(key);
    predictions.add(game.tournament, {
      user: row.user_id,
      prediction: prediction.value,
    });
    ledger.load('prediction_results');
  }

  // prediction_standings
  const standingsRows = new PerTournament<{
    user: number;
    pick: StoredTeamPick;
  }>();
  const placed = new Set<string>();
  for (const row of rows.prediction_standings) {
    const where = `team ${String(row.team_id)}`;
    const blocked = firstBlocked([
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_standings', blocked.fate, where);
      continue;
    }
    const team = teams.get(row.team_id);
    if (team === undefined)
      throw new ReaderProblem('map: a loaded team is missing');
    if (row.last16 !== null || row.last32 !== null) {
      ledger.refuse('prediction_standings', 'football-column-set', where);
      continue;
    }
    const pick = sportbetColumns.teamPick({ ...row, team: team.row.id });
    const checked = StandingsPrediction.stored(playerOf(row.user_id), [pick]);
    if (!checked.ok) {
      ledger.refuse('prediction_standings', checked.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.team_id)}`;
    if (placed.has(key)) {
      ledger.refuse('prediction_standings', 'duplicate-key', where);
      continue;
    }
    placed.add(key);
    standingsRows.add(team.tournament, { user: row.user_id, pick });
    ledger.load('prediction_standings');
  }

  // prediction_survivals: a pick has an event; a seeded slot has none
  const picks = new PerTournament<{ user: number; pick: SurvivalPick }>();
  const pickedRounds = new Set<string>();
  for (const row of rows.prediction_survivals) {
    if (row.event_id === null) {
      // A slot of a football tournament's team is skipped as football.
      const parent = teamFates.get(row.team_id);
      ledger.skip(
        'prediction_survivals',
        parent?.kind === 'skipped'
          ? parent.reason
          : 'seeded-slot-without-event',
      );
      continue;
    }
    const where = `event ${String(row.event_id)}`;
    const blocked = firstBlocked([
      eventFates.get(row.event_id),
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_survivals', blocked.fate, where);
      continue;
    }
    const round = rounds.get(row.event_id);
    const team = teams.get(row.team_id);
    if (round === undefined || team === undefined) {
      throw new ReaderProblem('map: a loaded pick parent is missing');
    }
    if (team.tournament !== round.tournament) {
      ledger.refuse('prediction_survivals', 'cross-tournament', where);
      continue;
    }
    const pick = sportbetColumns.survivalPick({
      team: team.row.id,
      event_day: round.number,
    });
    if (!pick.ok) {
      ledger.refuse('prediction_survivals', pick.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.event_id)}`;
    if (pickedRounds.has(key)) {
      ledger.refuse('prediction_survivals', 'two-picks-in-one-round', where);
      continue;
    }
    pickedRounds.add(key);
    picks.add(round.tournament, { user: row.user_id, pick: pick.value });
    ledger.load('prediction_survivals');
  }

  // point_results: production's match points
  const matchPoints = new PerTournament<{
    user: number;
    row: StoredMatchRow;
  }>();
  const scored = new Set<string>();
  for (const row of rows.point_results) {
    const where = `game ${String(row.game_id)}`;
    const blocked = firstBlocked([
      gameFates.get(row.game_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_results', blocked.fate, where);
      continue;
    }
    const game = games.get(row.game_id);
    if (game === undefined)
      throw new ReaderProblem('map: a loaded game is missing');
    const mapped = sportbetColumns.matchPointsRow({
      ...row,
      player: playerOf(row.user_id),
      game: game.game.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_results', mapped.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.game_id)}`;
    if (scored.has(key)) {
      ledger.refuse('point_results', 'duplicate-key', where);
      continue;
    }
    scored.add(key);
    matchPoints.add(game.tournament, { user: row.user_id, row: mapped.value });
    ledger.load('point_results');
  }

  // point_standings: production's standings points
  const standingsPoints = new PerTournament<{
    user: number;
    row: StandingsRow;
  }>();
  const standingsScored = new Set<string>();
  for (const row of rows.point_standings) {
    const where = `team ${String(row.team_id)}`;
    const blocked = firstBlocked([
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_standings', blocked.fate, where);
      continue;
    }
    const team = teams.get(row.team_id);
    if (team === undefined)
      throw new ReaderProblem('map: a loaded team is missing');
    const mapped = sportbetColumns.standingsPointsRow({
      ...row,
      player: playerOf(row.user_id),
      team: team.row.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_standings', mapped.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.team_id)}`;
    if (standingsScored.has(key)) {
      ledger.refuse('point_standings', 'duplicate-key', where);
      continue;
    }
    standingsScored.add(key);
    standingsPoints.add(team.tournament, {
      user: row.user_id,
      row: mapped.value,
    });
    ledger.load('point_standings');
  }

  // point_survivals: production's stored survival rows, by sportbet id
  const survivalPoints = new PerTournament<{
    user: number;
    row: SurvivalPoints;
  }>();
  for (const row of rows.point_survivals) {
    const where = `event ${String(row.event_id)}`;
    const blocked = firstBlocked([
      eventFates.get(row.event_id),
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_survivals', blocked.fate, where);
      continue;
    }
    const round = rounds.get(row.event_id);
    const team = teams.get(row.team_id);
    if (round === undefined || team === undefined) {
      throw new ReaderProblem('map: a loaded survival parent is missing');
    }
    if (team.tournament !== round.tournament) {
      ledger.refuse('point_survivals', 'cross-tournament', where);
      continue;
    }
    const mapped = sportbetColumns.survivalRow({
      ...row,
      player: playerOf(row.user_id),
      event_day: round.number,
      team: team.row.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_survivals', mapped.refusal, where);
      continue;
    }
    // A production row is the stored row itself: its stored id is its own.
    survivalPoints.add(round.tournament, {
      user: row.user_id,
      row: {
        player: mapped.value.player,
        round: mapped.value.round,
        team: mapped.value.team,
        points: mapped.value.storedPoints,
        provisional: false,
        storedId: mapped.value.id,
      },
    });
    ledger.load('point_survivals');
  }

  // Each loaded tournament: its players are its leagues' members and
  // everyone who owns one of its loaded rows.
  const loadedUsers = new Set<number>();
  const mapped: MappedTournament[] = [];
  for (const [id, tournament] of tournaments) {
    const owners = [
      ...members.of(id),
      ...predictions.of(id).map(({ user }) => user),
      ...standingsRows.of(id).map(({ user }) => user),
      ...picks.of(id).map(({ user }) => user),
      ...matchPoints.of(id).map(({ user }) => user),
      ...standingsPoints.of(id).map(({ user }) => user),
      ...survivalPoints.of(id).map(({ user }) => user),
    ];
    const playing = [...new Set(owners)]
      .filter((user) => users.has(user))
      .sort((a, b) => a - b);
    for (const user of playing) loadedUsers.add(user);
    const key = must(tournamentId(String(id)), 'tournament id');
    const players = playing.map((user): TournamentPlayer => {
      // An unsettled player is only ever mapped in the first pass, which
      // is discarded (mapSportbet).
      const isActive = unsettled.has(user) ? true : active.get(user);
      if (isActive === undefined) {
        throw new ReaderProblem('map: a loaded player has no user_settings');
      }
      const fillIns = predictions
        .of(id)
        .filter(
          (each) => each.user === user && each.prediction.origin === 'fill-in',
        ).length;
      const status = sportbetColumns.status({
        tournament: key,
        active: isActive,
        fillIns,
      });
      must(PlayerStatus.stored(status, sportbetRules), 'player status');
      return {
        player: playerOf(user),
        switchedOff: status.switchedOffIn.has(key),
        adminHidden: status.adminHidden,
        fillIns: status.fillIns.get(key) ?? 0,
      };
    });
    const standingsByUser = new Map<number, StoredTeamPick[]>();
    for (const { user, pick } of standingsRows.of(id)) {
      standingsByUser.set(user, [...(standingsByUser.get(user) ?? []), pick]);
    }
    const picksByUser = new Map<number, SurvivalPick[]>();
    for (const { user, pick } of picks.of(id)) {
      picksByUser.set(user, [...(picksByUser.get(user) ?? []), pick]);
    }
    const teamsOf = [...teams.values()].filter(
      (team) => team.tournament === id,
    );
    mapped.push({
      tournament,
      teams: teamsOf.map(({ row }) => row),
      rounds: [...rounds.values()]
        .filter((round) => round.tournament === id)
        .map(({ saved }) => saved),
      games: [...games.values()]
        .filter((game) => game.tournament === id)
        .map(({ game }) => game),
      outcomes: must(
        TeamOutcomes.stored(
          teamsOf.map(({ outcome }) => outcome),
          tournament.standingsTableFinal,
        ),
        'team outcomes',
      ),
      players,
      predictions: predictions.of(id).map(({ prediction }) => prediction),
      standings: [...standingsByUser].map(([user, rowsOfUser]) =>
        must(
          StandingsPrediction.stored(playerOf(user), rowsOfUser),
          'standings prediction',
        ),
      ),
      runs: new Map(
        [...picksByUser].map(([user, picksOfUser]) => [
          playerOf(user),
          must(SurvivalRun.stored(picksOfUser), 'survival run'),
        ]),
      ),
      production: {
        odds: odds.of(id),
        matches: matchPoints.of(id).map(({ row }) => row),
        standings: standingsPoints.of(id).map(({ row }) => row),
        survival: survivalPoints.of(id).map(({ row }) => row),
      },
    });
  }

  // users and user_settings, counted now that the players are known
  for (const [id, fate] of userFates) {
    if (fate.kind !== 'loaded') continue;
    if (loadedUsers.has(id)) {
      ledger.load('users');
    } else {
      ledger.skip('users', 'in-no-loaded-tournament');
    }
  }
  for (const [user, values] of settingsRows) {
    // An orphan's rows and differing duplicates are counted above.
    const fate = settingsFate.get(user);
    if (fate === undefined || fate === 'refused') continue;
    if (fate === 'unsettled') {
      values.forEach(() => {
        ledger.skip('user_settings', 'user-not-loaded');
      });
      continue;
    }
    const userFate = userFates.get(user);
    values.forEach((_, index) => {
      if (index > 0) {
        ledger.skip('user_settings', 'duplicate-equal');
      } else if (userFate?.kind === 'refused') {
        ledger.refuse('user_settings', dependsOn(userFate.reason));
      } else if (loadedUsers.has(user)) {
        ledger.load('user_settings');
      } else {
        ledger.skip('user_settings', 'user-not-loaded');
      }
    });
  }

  const mappedRows: Mapped = {
    players: [...loadedUsers]
      .sort((a, b) => a - b)
      .flatMap((id) => {
        const player = users.get(id);
        return player === undefined ? [] : [player];
      }),
    tournaments: mapped,
    tables: ledger.tables(),
    notices,
  };
  return {
    mapped: mappedRows,
    unsettledPlayers: [...unsettled].filter((user) => loadedUsers.has(user)),
  };
}

/**
 * What each recalculation does with a game whose odds rows were refused,
 * as the rule sets decide: the game has no stored odds row, which a set
 * reading stored odds scores at CO-5's missing odds or refuses
 * (missingOddsScoreAtOne), and a set computing odds from the votes never
 * reads (inputReadsOf).
 */
function withoutStoredOdds(game: Game): string {
  if (game.result === null) {
    return 'The game has no result, so no recalculation reads its odds';
  }
  const under = (rules: RuleSet) => {
    const recalculation = `the ${rules.name} recalculation`;
    if (inputReadsOf(rules).odds === 'from-votes') {
      return `${recalculation} computes its odds from the votes`;
    }
    return rules.missingOddsScoreAtOne
      ? `${recalculation} scores it at CO-5's missing odds, 1.0, so its ${rules.name} match points may differ from production's`
      : `${recalculation} is refused (odds-missing)`;
  };
  return `The game is scored and now has no stored odds: ${under(sportbetRules)}; ${under(ruledRules)}`;
}

/** A parent's fate as its dependants see it: skipped stays skipped, refused is inherited. */
function inherit(parent: Fate): Fate {
  switch (parent.kind) {
    case 'loaded':
      return LOADED;
    case 'skipped':
      return parent;
    case 'refused':
      return refused(dependsOn(parent.reason));
  }
}

/**
 * The first parent that keeps a row from loading: an unknown one (an
 * orphan) first, then one skipped or refused. Null when all are loaded.
 */
function firstBlocked(
  parents: readonly (Fate | undefined)[],
): { readonly fate: Fate | undefined } | null {
  if (parents.includes(undefined)) return { fate: undefined };
  const blocked = parents.find(
    (parent) => parent !== undefined && parent.kind !== 'loaded',
  );
  return blocked === undefined ? null : { fate: blocked };
}
