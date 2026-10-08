import { gameOf, teamOf } from '@sportbet/db';
import {
  Game,
  inputReadsOf,
  LAST_REGULAR_SEASON_ROUND,
  Round,
  ruledRules,
  sportbetColumns,
  sportbetRules,
  TeamOutcomes,
  type GameOdds,
  type Result,
  type RoundInput,
  type RuleSet,
  type TeamOutcome,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { SportbetRow } from '../read-columns';
import {
  firstBlocked,
  inherit,
  LOADED,
  PerTournament,
  refused,
  skipped,
  tipOffOf,
  type Fate,
  type GameEntry,
  type MapContext,
  type RoundRow,
  type TeamEntry,
} from './ledger';

// The tournaments' own rows: tournaments, their rounds (events), teams and
// their outcomes, games and the games' stored odds.

export interface MappedTournaments {
  readonly fates: Map<number, Fate>;
  readonly tournaments: Map<number, Tournament>;
  readonly profiles: Map<number, TournamentProfile>;
}

/** Why a tournament row was refused: its own columns', then its profile's. */
function tournamentRefusal(
  mapped: ReturnType<typeof sportbetColumns.tournament>,
  profile: ReturnType<typeof sportbetColumns.tournamentProfile>,
): string {
  if (!mapped.ok) return mapped.refusal;
  if (!profile.ok) return profile.refusal;
  throw new ReaderProblem('map: a tournament both loaded and refused');
}

/** tournaments: a Euroleague one loaded with its profile; another format skipped. */
export function mapTournaments(ctx: MapContext): MappedTournaments {
  const { ledger } = ctx;
  const fates = new Map<number, Fate>();
  const tournaments = new Map<number, Tournament>();
  const profiles = new Map<number, TournamentProfile>();
  for (const row of ctx.rows.tournaments) {
    const mapped = sportbetColumns.tournament(row);
    const profile = sportbetColumns.tournamentProfile(row);
    if (mapped.ok && profile.ok) {
      tournaments.set(row.id, mapped.value);
      profiles.set(row.id, profile.value);
      fates.set(row.id, LOADED);
      ledger.load('tournaments');
    } else if (!mapped.ok && mapped.refusal === 'format-not-ported') {
      fates.set(row.id, skipped('not-euroleague'));
      ledger.skip('tournaments', 'not-euroleague');
    } else {
      const refusal = tournamentRefusal(mapped, profile);
      fates.set(row.id, refused(refusal));
      ledger.refuse('tournaments', refusal, `id ${String(row.id)}`);
    }
  }
  if (tournaments.size > 0) {
    ctx.notices.push(
      'tournaments: sportbet does not record whether its standings table is final (R-14); every tournament is loaded with it not final',
    );
  }
  return { fates, tournaments, profiles };
}

export interface MappedRounds {
  readonly fates: Map<number, Fate>;
  readonly rounds: Map<number, RoundRow>;
}

/**
 * One event row as a round, or why not: sportbet stores no stage, so a
 * round after the regular season's last is one whose stage cannot be read.
 */
function roundOf(row: SportbetRow<'events'>): Result<RoundInput, string> {
  if (row.event_day > LAST_REGULAR_SEASON_ROUND) {
    return { ok: false, refusal: 'stage-unknown' };
  }
  return sportbetColumns.round({ ...row, stage: 'regular' });
}

/** events: the rounds, one per tournament and round number. */
export function mapEvents(
  ctx: MapContext,
  tournamentFates: ReadonlyMap<number, Fate>,
): MappedRounds {
  const { ledger } = ctx;
  const fates = new Map<number, Fate>();
  const rounds = new Map<number, RoundRow>();
  const roundNumbers = new Set<string>();
  const refuse = (row: SportbetRow<'events'>, reason: string) => {
    fates.set(row.id, refused(reason));
    ledger.refuse('events', reason, `id ${String(row.id)}`);
  };
  for (const row of ctx.rows.events) {
    const parent = tournamentFates.get(row.tournament_id);
    if (!ledger.follow('events', parent, `id ${String(row.id)}`)) {
      fates.set(
        row.id,
        parent === undefined ? refused('orphan') : inherit(parent),
      );
      continue;
    }
    const mapped = roundOf(row);
    if (!mapped.ok) {
      refuse(row, mapped.refusal);
      continue;
    }
    const key = `${String(row.tournament_id)}/${String(mapped.value.number)}`;
    if (roundNumbers.has(key)) {
      refuse(row, 'duplicate-key');
      continue;
    }
    roundNumbers.add(key);
    rounds.set(row.id, {
      tournament: row.tournament_id,
      number: mapped.value.number,
      saved: { id: row.id, name: row.event, round: Round.stored(mapped.value) },
    });
    fates.set(row.id, LOADED);
    ledger.load('events');
  }
  return { fates, rounds };
}

export interface MappedTeams {
  readonly fates: Map<number, Fate>;
  readonly teams: Map<number, TeamEntry>;
}

/** One team row's outcome, or why not: football's columns, then the outcome's own checks. */
function teamOutcomeOf(row: SportbetRow<'teams'>): Result<TeamOutcome, string> {
  if (row.last16 !== null || row.last32 !== null) {
    return { ok: false, refusal: 'football-column-set' };
  }
  const outcome = sportbetColumns.teamOutcome({ ...row, team: teamOf(row.id) });
  if (!outcome.ok) return outcome;
  const shape = TeamOutcomes.stored([outcome.value], false);
  return shape.ok ? outcome : shape;
}

/** teams, and their outcomes. */
export function mapTeams(
  ctx: MapContext,
  tournamentFates: ReadonlyMap<number, Fate>,
): MappedTeams {
  const { ledger } = ctx;
  const fates = new Map<number, Fate>();
  const teams = new Map<number, TeamEntry>();
  for (const row of ctx.rows.teams) {
    const where = `id ${String(row.id)}`;
    const parent = tournamentFates.get(row.tournament_id);
    if (!ledger.follow('teams', parent, where)) {
      fates.set(
        row.id,
        parent === undefined ? refused('orphan') : inherit(parent),
      );
      continue;
    }
    const outcome = teamOutcomeOf(row);
    if (!outcome.ok) {
      fates.set(row.id, refused(outcome.refusal));
      ledger.refuse('teams', outcome.refusal, where);
      continue;
    }
    teams.set(row.id, {
      tournament: row.tournament_id,
      row: { id: teamOf(row.id), name: row.team },
      outcome: outcome.value,
    });
    fates.set(row.id, LOADED);
    ledger.load('teams');
  }
  return { fates, teams };
}

export interface MappedGames {
  readonly fates: Map<number, Fate>;
  readonly games: Map<number, GameEntry>;
}

/** A game row's loaded parents: its round and its two teams. */
interface GameParents {
  readonly round: RoundRow;
  readonly home: TeamEntry;
  readonly away: TeamEntry;
}

/**
 * Scores sportbet refuses, or the rebuild loads otherwise, are the owner's
 * call, so the run stops on them: sportbet f3e08eb's postponed placeholder
 * -1 : -1 (the rebuild has a postponed state instead, R-41; refusing the
 * game would drop every row that depends on it), and any other negative.
 */
function assertLoadableScore(row: SportbetRow<'games'>): void {
  if (row.home_team_score === -1 && row.away_team_score === -1) {
    throw new ReaderProblem(
      `map: game ${String(row.id)} holds sportbet's postponed placeholder -1 : -1 (f3e08eb); R-41 gives a postponed game its own state, so how to load it is the owner's call`,
    );
  }
  if ((row.home_team_score ?? 0) < 0 || (row.away_team_score ?? 0) < 0) {
    throw new ReaderProblem(
      `map: game ${String(row.id)} has a negative score that is not sportbet's postponed placeholder -1 : -1, which sportbet refuses; how to load it is the owner's call`,
    );
  }
}

/** One game row as a stored game, or why not: its teams in another tournament, its date, its columns. */
function gameOfRow(
  row: SportbetRow<'games'>,
  parents: GameParents,
): Result<Game, string> {
  const { round, home, away } = parents;
  if (
    home.tournament !== round.tournament ||
    away.tournament !== round.tournament
  ) {
    return { ok: false, refusal: 'cross-tournament' };
  }
  const tipOff = tipOffOf(row.game_date);
  if (!tipOff.ok) return tipOff;
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
  return mapped.ok ? Game.stored(mapped.value) : mapped;
}

/** A game whose parents all loaded: the parents themselves. */
function gameParents(
  row: SportbetRow<'games'>,
  rounds: MappedRounds,
  teams: MappedTeams,
): GameParents {
  const round = rounds.rounds.get(row.event_id);
  const home = teams.teams.get(row.home_team_id);
  const away = teams.teams.get(row.away_team_id);
  if (round === undefined || home === undefined || away === undefined) {
    throw new ReaderProblem('map: a loaded game parent is missing');
  }
  return { round, home, away };
}

/** games: one per round and pairing. */
export function mapGames(
  ctx: MapContext,
  parents: { readonly rounds: MappedRounds; readonly teams: MappedTeams },
): MappedGames {
  const { ledger } = ctx;
  const fates = new Map<number, Fate>();
  const games = new Map<number, GameEntry>();
  const pairings = new Set<string>();
  const refuse = (row: SportbetRow<'games'>, reason: string) => {
    fates.set(row.id, refused(reason));
    ledger.refuse('games', reason, `id ${String(row.id)}`);
  };
  for (const row of ctx.rows.games) {
    const blocked = firstBlocked([
      parents.rounds.fates.get(row.event_id),
      parents.teams.fates.get(row.home_team_id),
      parents.teams.fates.get(row.away_team_id),
    ]);
    if (blocked !== null) {
      ledger.follow('games', blocked.fate, `id ${String(row.id)}`);
      fates.set(
        row.id,
        blocked.fate === undefined ? refused('orphan') : inherit(blocked.fate),
      );
      continue;
    }
    const loaded = gameParents(row, parents.rounds, parents.teams);
    assertLoadableScore(row);
    const game = gameOfRow(row, loaded);
    if (!game.ok) {
      refuse(row, game.refusal);
      continue;
    }
    const pairing = `${String(row.event_id)}/${String(row.home_team_id)}/${String(row.away_team_id)}`;
    if (pairings.has(pairing)) {
      refuse(row, 'duplicate-key');
      continue;
    }
    pairings.add(pairing);
    games.set(row.id, {
      tournament: loaded.round.tournament,
      game: game.value,
    });
    fates.set(row.id, LOADED);
    ledger.load('games');
  }
  return { fates, games };
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

/** A game's mapped odds rows, by sportbet id. */
interface OddsOfGame {
  readonly tournament: number;
  readonly game: Game;
  readonly rows: { id: number; odds: GameOdds }[];
}

/** Each loaded game's mapped odds rows. */
function oddsRowsByGame(
  ctx: MapContext,
  games: MappedGames,
): Map<number, OddsOfGame> {
  const { ledger } = ctx;
  const oddsOfGame = new Map<number, OddsOfGame>();
  for (const row of ctx.rows.game_odds) {
    const where = `id ${String(row.id)}`;
    if (!ledger.follow('game_odds', games.fates.get(row.game_id), where)) {
      continue;
    }
    const game = games.games.get(row.game_id);
    if (game === undefined) {
      throw new ReaderProblem('map: a loaded game is missing');
    }
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
  return oddsOfGame;
}

const sameOdds = (a: GameOdds, b: GameOdds): boolean =>
  a.odds.home.equals(b.odds.home) &&
  a.odds.away.equals(b.odds.away) &&
  a.odds.draw.equals(b.odds.draw);

/**
 * game_odds: sportbet reads first() with no order. Rows equal to each
 * other keep the lowest id; rows that differ refuse the game's odds, as
 * which one sportbet scored with cannot be known.
 */
export function mapGameOdds(
  ctx: MapContext,
  games: MappedGames,
): PerTournament<GameOdds> {
  const { ledger, notices } = ctx;
  const odds = new PerTournament<GameOdds>();
  for (const [id, { tournament, game, rows: found }] of oddsRowsByGame(
    ctx,
    games,
  )) {
    const [kept, ...extra] = found;
    if (kept === undefined) continue;
    if (extra.some((each) => !sameOdds(each.odds, kept.odds))) {
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
  return odds;
}
