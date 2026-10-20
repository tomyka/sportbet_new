import { lateJoinerFillIns, type FillInDice } from '../fill-in/fill-in';
import type { MatchPrediction } from '../prediction/match-prediction';
import {
  isFinishedWindowAt,
  isRegistrationOpenWindowAt,
  type RegistrationWindow,
  type Season,
} from '../round/season';
import type { GameId, PlayerId, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { Tournament } from '../tournament/tournament';

/**
 * TournamentRegistrationService::isOpenForRegistration: the tournament is
 * not finished (R-21; sportbet's effectiveStatus) and registration has not
 * closed - at the first game's start under both rule sets (R-128,
 * isRegistrationOpenWindowAt).
 */
export function isOpenForRegistration(season: Season, now: Instant): boolean {
  return isOpenForRegistrationWindowAt(season.registrationWindow(), now);
}

/**
 * isOpenForRegistration from a tournament's window alone
 * (Season.registrationWindow, or the database's tournament catalogue,
 * loadTournamentCatalogue): not finished (R-21) and not closed (PL-2). The
 * hub asks it of every card without loading a season.
 */
export function isOpenForRegistrationWindowAt(
  window: RegistrationWindow,
  now: Instant,
): boolean {
  return (
    !isFinishedWindowAt(window, now) && isRegistrationOpenWindowAt(window, now)
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
  readonly now: Instant;
  readonly dice: FillInDice;
}

/**
 * TournamentRegistrationService::register: refused unless the tournament
 * takes players at `now`; else a place, a blank prediction row per game
 * and a standings row per team, each only where missing, so joining twice
 * changes nothing (PredictionRows::seedMissing). A newcomer joining late
 * gets a fill-in for each game they can no longer
 * predict instead of a blank row (R-9, lateJoinerFillIns); a player already
 * in is no late joiner. Survival needs no row: picks are a history.
 */
export function joinTournament(
  input: JoiningInput,
): Result<Joining, JoiningRefusal> {
  const { player, season, teams, alreadyIn, now, dice } = input;
  if (!isOpenForRegistration(season, now)) {
    return refuse('registration-closed');
  }
  const lateFillIns = alreadyIn
    ? Object.freeze([])
    : lateJoinerFillIns({ player, games: season.games, dice, madeAt: now });
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
  /** `is_public` (TournamentProfile): R-50 keeps sign-up out of a non-public one. */
  readonly isPublic: boolean;
}

/** One tournament's window as sign-up reads it: whether it takes players, and whether sign-up may join it (R-50). */
export interface SignUpWindow {
  readonly window: RegistrationWindow;
  readonly isPublic: boolean;
}

/**
 * ChecksRegistrationDeadline::anyTournamentIsJoinable, from each
 * tournament's window (Season.registrationWindow, or the database's
 * isRegistrationOpen): registration is open while some tournament sign-up
 * may join (a public one, R-50: sign-up never joins a non-public tournament, by
 * R-27 or by `?tournament=`, and it does not open sign-up, R-49) takes players. With none taking
 * players it is open only on an empty installation - every tournament
 * finished and no game anywhere (Q4, R-49), whatever its public switch -
 * whose first account creates the tournaments.
 */
export function registrationIsOpen(
  windows: readonly SignUpWindow[],
  now: Instant,
): boolean {
  const joinable = windows.some(
    ({ window, isPublic }) =>
      isPublic && isOpenForRegistrationWindowAt(window, now),
  );
  if (joinable) return true;
  return windows.every(
    ({ window }) => isFinishedWindowAt(window, now) && window.games === 0,
  );
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
 * fallback, among the public tournaments (R-50, sign-up never joins another): the tournament named by `intended` (the slug /login or /register
 * was given) if it takes players; else the open tournament whose next game
 * is soonest; else none - joining nothing is recoverable on the hub,
 * joining a tournament that cannot take the player is not.
 */
export function tournamentToJoin(input: {
  readonly intended: string | null;
  readonly candidates: readonly JoinCandidate[];
  readonly now: Instant;
}): Tournament | null {
  const { intended, candidates, now } = input;
  const open = candidates.filter(
    ({ season, isPublic }) => isPublic && isOpenForRegistration(season, now),
  );
  const named = open.find(({ tournament }) => tournament.slug === intended);
  if (named !== undefined) return named.tournament;
  return [...open].sort(soonerFirst(now))[0]?.tournament ?? null;
}
