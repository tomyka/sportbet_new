import type { RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Game } from './game';
import type { GameFormEntry } from './game-form';
import type { Season } from './season';

/**
 * What belongs to the game's tournament (issue 272): its teams, and its
 * rounds by database id - the id the form posts as `eventID` - with the
 * round's number. A team or round outside it is a mixed tournament.
 */
export interface GameScope {
  readonly teams: readonly TeamId[];
  readonly rounds: ReadonlyMap<number, RoundNumber>;
}

/** A game to insert: its tip-off, its teams and its round (by id and number). */
export interface NewGame {
  readonly roundId: number;
  readonly round: RoundNumber;
  readonly home: TeamId;
  readonly away: TeamId;
  readonly tipOff: Instant;
}

/** An existing game as the admin changed it, and the id of its round. */
export interface ChangedGame {
  readonly game: Game;
  readonly roundId: number;
}

type PlacementRefusal =
  | 'tournament-finished'
  | 'mixed-tournament'
  | 'same-team-twice'
  | 'duplicate-pair';

export type NewGameRefusal = PlacementRefusal;
export type GameChangeRefusal = PlacementRefusal | 'teams-fixed';
export type GameDeletionRefusal =
  | 'tournament-finished'
  | 'has-real-predictions'
  | 'has-result'
  | 'has-survival-picks';

/**
 * The round's number when the round and both teams are the tournament's
 * (issue 272: a dropdown is a convenience, not a constraint), else the
 * refusal.
 */
function placementIn(
  scope: GameScope,
  entry: GameFormEntry,
): Result<RoundNumber, 'mixed-tournament' | 'same-team-twice'> {
  const round = scope.rounds.get(entry.roundId);
  if (
    round === undefined ||
    !scope.teams.includes(entry.home) ||
    !scope.teams.includes(entry.away)
  ) {
    return refuse('mixed-tournament');
  }
  return entry.home === entry.away ? refuse('same-team-twice') : ok(round);
}

/** D16(c): one game per round and pair of teams, home and away as they stand. */
function pairTaken(
  season: Season,
  placement: Pick<NewGame, 'round' | 'home' | 'away'>,
  except: Game | null,
): boolean {
  return season.games.some(
    (game) =>
      game.id !== except?.id &&
      game.round === placement.round &&
      game.home === placement.home &&
      game.away === placement.away,
  );
}

/**
 * insertGame's game, decided: refused on a finished tournament (R-110), a
 * team or round that is not the tournament's (issue 272), one team on both
 * sides, or a pair the round already has (D16(c)).
 */
export function planNewGame(
  season: Season,
  entry: GameFormEntry,
  context: { readonly scope: GameScope; readonly finished: boolean },
): Result<NewGame, NewGameRefusal> {
  if (context.finished) return refuse('tournament-finished');
  const round = placementIn(context.scope, entry);
  if (!round.ok) return round;
  const planned: NewGame = {
    roundId: entry.roundId,
    round: round.value,
    home: entry.home,
    away: entry.away,
    tipOff: entry.tipOff,
  };
  return pairTaken(season, planned, null)
    ? refuse('duplicate-pair')
    : ok(planned);
}

/** R-90: the teams of a started game with a real prediction on it are fixed. */
function teamsFixed(
  game: Game,
  entry: GameFormEntry,
  context: { readonly realPredictions: number; readonly now: Instant },
): boolean {
  const teamsChange = entry.home !== game.home || entry.away !== game.away;
  return (
    teamsChange &&
    context.realPredictions > 0 &&
    game.hasTippedOffAt(context.now)
  );
}

/**
 * updateGame's change of `game`, decided. Refused on a finished tournament
 * (R-110), a team or round that is not the tournament's (issue 272), one
 * team on both sides, another game's pair in the round (D16(c)), or - R-90 -
 * other teams on a started game that already holds a real prediction. A
 * changed date goes through `Game.reschedule` (R-13: under the ruled set a
 * game moved after it locked stays locked); a date left as it is is not a
 * move.
 */
export function planGameChange(
  season: Season,
  game: Game,
  entry: GameFormEntry,
  context: {
    readonly scope: GameScope;
    readonly realPredictions: number;
    readonly now: Instant;
    readonly finished: boolean;
  },
): Result<ChangedGame, GameChangeRefusal> {
  if (context.finished) return refuse('tournament-finished');
  const round = placementIn(context.scope, entry);
  if (!round.ok) return round;
  if (teamsFixed(game, entry, context)) return refuse('teams-fixed');
  const placement = { round: round.value, home: entry.home, away: entry.away };
  if (pairTaken(season, placement, game)) return refuse('duplicate-pair');
  const placed = game.rearranged(placement);
  if (!placed.ok) return placed;
  const changed =
    entry.tipOff === game.tipOff
      ? placed.value
      : placed.value.reschedule(entry.tipOff, context.now);
  return ok({ game: changed, roundId: entry.roundId });
}

/**
 * deleteGame, decided (R-89): a game may be deleted until a player saves a
 * real prediction on it (its blank rows go with it). A game with a result
 * is kept as well, with its fill-ins and audit rows (R-69; the owner,
 * 2026-10-13), and so is one whose result history is recorded: the audit
 * rows stay, and their key is `restrict`. A game one of whose two teams a
 * survival player has picked in its round is kept too (R-125, as deleteRound
 * keeps a round with picks), after the result. A finished tournament refuses
 * first (R-110).
 */
export function gameDeletion(
  game: Game,
  context: {
    readonly realPredictions: number;
    /** A result or postponement was once entered for the game (an audit_results row names it, R-69). */
    readonly resultHistory: boolean;
    /** Survival picks naming one of the game's teams in its round (R-125). */
    readonly survivalPicks: number;
    readonly finished: boolean;
  },
): Result<null, GameDeletionRefusal> {
  if (context.finished) return refuse('tournament-finished');
  if (context.realPredictions > 0) return refuse('has-real-predictions');
  if (game.result !== null || context.resultHistory) {
    return refuse('has-result');
  }
  return context.survivalPicks > 0 ? refuse('has-survival-picks') : ok(null);
}
