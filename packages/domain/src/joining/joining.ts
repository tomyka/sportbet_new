import { lateJoinerFillIns, type FillInDice } from '../fill-in/fill-in';
import type { MatchPrediction } from '../prediction/match-prediction';
import {
  isFinishedWindowAt,
  isRegistrationOpenWindowAt,
  type RegistrationWindow,
  type Season,
} from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Tournament } from '../tournament/tournament';

/**
 * TournamentRegistrationService::isOpenForRegistration: the tournament is
 * not finished (R-21; sportbet's effectiveStatus) and registration has not
 * closed under the rule set - at the first game for sportbet, at the
 * standings deadline under R-8 (isRegistrationOpenWindowAt).
 */
export function isOpenForRegistration(
  season: Season,
  now: Instant,
  rules: RuleSet,
): boolean {
  return takesPlayersAt(season.registrationWindow(), now, rules);
}

function takesPlayersAt(
  window: RegistrationWindow,
  now: Instant,
  rules: RuleSet,
): boolean {
  return (
    !isFinishedWindowAt(window, now) &&
    isRegistrationOpenWindowAt(window, now, rules)
  );
}

/** What one player's join writes: each row only where it is missing. */
export interface Joining {
  /** The player had no place in the tournament: one is written. */
  readonly newcomer: boolean;
  /** A blank prediction row for each of these games. */
  readonly blankGames: readonly GameId[];
  /** A blank standings row for each of the tournament's teams. */
  readonly standingsTeams: readonly TeamId[];
  /** R-9: a late joiner's games already played; empty for sportbet. */
  readonly lateFillIns: readonly MatchPrediction[];
}

export type JoiningRefusal = 'registration-closed';

export interface JoiningInput {
  readonly player: PlayerId;
  readonly season: Season;
  /** The tournament's teams (sportbet seeds a standings row for each). */
  readonly teams: readonly TeamId[];
  /** The player already has a place in the tournament. */
  readonly alreadyIn: boolean;
  readonly rules: RuleSet;
  readonly now: Instant;
  readonly dice: FillInDice;
}

/**
 * TournamentRegistrationService::register: refused unless the tournament
 * takes players at `now`; else a place, a blank prediction row per game
 * and a standings row per team, each only where missing, so joining twice
 * changes nothing (PredictionRows::seedMissing). A newcomer joining late
 * under the ruled set gets a fill-in for each game they can no longer
 * predict instead of a blank row (R-9, lateJoinerFillIns); a player already
 * in is no late joiner. Survival needs no row: picks are a history.
 */
export function joinTournament(
  input: JoiningInput,
): Result<Joining, JoiningRefusal> {
  const { player, season, teams, alreadyIn, rules, now, dice } = input;
  if (!isOpenForRegistration(season, now, rules)) {
    return refuse('registration-closed');
  }
  const lateFillIns = alreadyIn
    ? Object.freeze([])
    : lateJoinerFillIns(player, season.games, dice, now, rules);
  const filled = new Set(lateFillIns.map((prediction) => prediction.game));
  return ok({
    newcomer: !alreadyIn,
    blankGames: Object.freeze(
      season.games.map((game) => game.id).filter((id) => !filled.has(id)),
    ),
    standingsTeams: Object.freeze([...teams]),
    lateFillIns,
  });
}

/** A tournament a new account might join, with its season. */
export interface JoinCandidate {
  readonly tournament: Tournament;
  readonly season: Season;
}

/**
 * ChecksRegistrationDeadline::anyTournamentIsJoinable, from each
 * tournament's window (Season.registrationWindow, or the database's
 * isRegistrationOpen): registration is open while some tournament that is
 * not finished takes players. With none unfinished it is open only when no
 * game exists at all - an empty installation, whose first account creates
 * the tournaments (Q4).
 */
export function registrationIsOpen(
  windows: readonly RegistrationWindow[],
  now: Instant,
  rules: RuleSet,
): boolean {
  if (windows.every((window) => isFinishedWindowAt(window, now))) {
    return windows.every((window) => window.games === 0);
  }
  return windows.some((window) => takesPlayersAt(window, now, rules));
}

/** The tip-off of the soonest game still open for predictions, or null. */
function nextGameAt(season: Season, now: Instant): Instant | null {
  return season.games
    .filter((game) => game.isOpenAt(now))
    .reduce<Instant | null>(
      (soonest, game) =>
        soonest === null || game.tipOff < soonest ? game.tipOff : soonest,
      null,
    );
}

/**
 * R-27 (Q1): the soonest next game first; a tournament with none after
 * every one that has one; on a tie, and among those with none, the newest
 * (the highest id), as R-46 settles its tie.
 */
function soonerFirst(now: Instant) {
  return (a: JoinCandidate, b: JoinCandidate): number => {
    const first = nextGameAt(a.season, now);
    const second = nextGameAt(b.season, now);
    if (first !== second) {
      if (first === null) return 1;
      if (second === null) return -1;
      return first - second;
    }
    return b.tournament.id - a.tournament.id;
  };
}

/**
 * PostRegisterController::resolveIntendedTournament, with R-27 for its
 * fallback: the tournament named by `intended` (the slug /login or
 * /register was given) if it takes players; else the open tournament whose
 * next game is soonest; else none - joining nothing is recoverable on the
 * hub, joining a tournament that cannot take the player is not.
 */
export function tournamentToJoin(input: {
  readonly intended: string | null;
  readonly candidates: readonly JoinCandidate[];
  readonly now: Instant;
  readonly rules: RuleSet;
}): Tournament | null {
  const { intended, candidates, now, rules } = input;
  const open = candidates.filter(({ season }) =>
    isOpenForRegistration(season, now, rules),
  );
  const named = open.find(({ tournament }) => tournament.slug === intended);
  if (named !== undefined) return named.tournament;
  return [...open].sort(soonerFirst(now))[0]?.tournament ?? null;
}
