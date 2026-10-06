import { utcDay } from '../account/session';
import { isFinishedWindowAt, type RegistrationWindow } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { Instant } from '../shared/instant';
import type { TournamentProfile } from '../tournament/tournament-profile';

/** The hub's groups, in the order sportbet lists them (Tournament::DISPLAY_ORDER). */
export const HUB_GROUPS = ['active', 'upcoming', 'finished'] as const;

export type HubGroup = (typeof HUB_GROUPS)[number];

/**
 * Tournament::effectiveStatus: the group a tournament is listed in.
 * Finished first: under sportbet, when the admin marked it finished, when
 * it has games and every one is scored (gameCensus), or once its end date
 * is before today (UTC, so it stays on all of that day); under R-55 only
 * as R-21 finishes it (isFinishedWindowAt). Then upcoming, when the admin
 * says so or its start date is after today (UTC); else active - a missing
 * date has no opinion.
 */
export function hubGroup(input: {
  readonly profile: Pick<TournamentProfile, 'status' | 'startsOn'>;
  readonly window: RegistrationWindow;
  readonly now: Instant;
  readonly rules: RuleSet;
}): HubGroup {
  const { profile, window, now, rules } = input;
  const finished = rules.hubFinishedFollowsR21
    ? isFinishedWindowAt(window, now)
    : profile.status === 'finished' ||
      (window.games > 0 && window.allScored) ||
      (window.endsAt !== null && now >= window.endsAt);
  if (finished) return 'finished';
  if (
    profile.status === 'upcoming' ||
    (profile.startsOn !== null && profile.startsOn > utcDay(now))
  ) {
    return 'upcoming';
  }
  return 'active';
}

/** What orderHub sorts a tournament by. */
export interface HubPlace {
  readonly id: number;
  readonly group: HubGroup;
  /** `YYYY-MM-DD`, or null. */
  readonly startsOn: string | null;
}

function byStart(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

/**
 * Tournament::orderByEffectiveStatus: by group (active, upcoming,
 * finished), then by start date, a tournament with none first. sportbet
 * leaves the rest to PHP's stable sort over rows MySQL returns by id, so
 * the rest is by id.
 */
export function orderHub<T extends HubPlace>(
  places: readonly T[],
): readonly T[] {
  const rank = (place: HubPlace) => HUB_GROUPS.indexOf(place.group);
  return Object.freeze(
    [...places].sort(
      (a, b) =>
        rank(a) - rank(b) || byStart(a.startsOn, b.startsOn) || a.id - b.id,
    ),
  );
}

/**
 * R-50: under the ruled set a non-public tournament is shown - on the hub,
 * and at its own address - only to a player in it and to an admin.
 * sportbet's hub lists every tournament.
 */
export function canSeeTournament(input: {
  readonly isPublic: boolean;
  readonly member: boolean;
  readonly isAdmin: boolean;
  readonly rules: RuleSet;
}): boolean {
  const { isPublic, member, isAdmin, rules } = input;
  return !rules.nonPublicTournamentsHidden || isPublic || member || isAdmin;
}

/**
 * The card's button: "Žaisti →" (play), "Prisijungti →" (join) and
 * "Peržiūrėti →" (view) enter the tournament; "Registruotis į turnyrą →"
 * opens its form; "Peržiūrėti rezultatus →" its page.
 */
export type CardAction = 'play' | 'join' | 'view' | 'register' | 'view-results';

/**
 * hub.blade.php's action button. A finished card lets its players back in
 * and shows anyone else its results page. On an active or upcoming card a
 * player in the tournament enters it, a signed-in player who is not gets
 * the registration link while it is open (issue #63), and a guest gets
 * nothing (issue 105).
 */
export function cardAction(input: {
  readonly group: HubGroup;
  readonly signedIn: boolean;
  readonly member: boolean;
  readonly registrationOpen: boolean;
}): CardAction | null {
  const { group, signedIn, member, registrationOpen } = input;
  if (group === 'finished') return member ? 'view' : 'view-results';
  if (!signedIn) return null;
  if (member) return group === 'active' ? 'play' : 'join';
  return registrationOpen ? 'register' : null;
}

/** Which of a card's widgets the hub draws. */
export interface HubWidgets {
  /** "Kaip tai veikia?" */
  readonly howItWorks: boolean;
  /** "Artėjančios rungtynės", when there are any. */
  readonly upcomingGames: boolean;
  /** "Lyderiai", "Finalų prognozės" and "Statistika". */
  readonly guestPanels: boolean;
}

/**
 * hub.blade.php's widgets: an upcoming card explains the game and lists
 * its next games, to everyone; an active card shows a guest its leaders,
 * medal count, next games and stats; a player's active card and every
 * finished card show none.
 */
export function widgetsShown(group: HubGroup, signedIn: boolean): HubWidgets {
  const guestOnActive = group === 'active' && !signedIn;
  return {
    howItWorks: group === 'upcoming',
    upcomingGames: group === 'upcoming' || guestOnActive,
    guestPanels: guestOnActive,
  };
}

/**
 * The tournament page's header button (show.blade.php): "Prisijungti ir
 * dalyvauti" for a guest; "Registruotis į turnyrą" for a signed-in player
 * not in it while it is open; else "Sukurti lygą šiame turnyre".
 */
export type TournamentPageAction = 'sign-in' | 'register' | 'create-league';

export function tournamentPageAction(input: {
  readonly signedIn: boolean;
  readonly member: boolean;
  readonly registrationOpen: boolean;
}): TournamentPageAction {
  const { signedIn, member, registrationOpen } = input;
  if (!signedIn) return 'sign-in';
  return !member && registrationOpen ? 'register' : 'create-league';
}

/** What the registration form's address answers a signed-in player. */
export type RegistrationFormStep = 'member' | 'closed' | 'open';

/**
 * TournamentController::registerForm with R-53: a player already in the
 * tournament is taken into it, before or after registration closes;
 * anyone else gets the form while registration is open, else the hub with
 * "Registracija į šį turnyrą jau pasibaigė.".
 */
export function registrationFormStep(input: {
  readonly member: boolean;
  readonly registrationOpen: boolean;
}): RegistrationFormStep {
  if (input.member) return 'member';
  return input.registrationOpen ? 'open' : 'closed';
}
