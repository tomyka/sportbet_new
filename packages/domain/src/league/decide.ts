import type { PlayerId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import type { Tournament } from '../tournament/tournament';
import type { LeagueEntry } from './form';
import type { League, LeagueId, LeagueInvite, LeagueMember } from './league';

// One Result decision per league action (LeagueController, slice 12b). Each
// refusal is listed in the order sportbet answers it. R-105: `is_admin` is
// set only by createLeague and transferLeague.

/** A league to insert: private, owned by the player, whose membership it carries. */
export interface NewLeague {
  readonly tournament: Tournament['id'];
  readonly owner: PlayerId;
  readonly name: string;
  readonly description: string | null;
  readonly baseFee: number | null;
  readonly penaltyStep: number | null;
  readonly reward: string | null;
  readonly membership: { readonly isAdmin: true; readonly isGuest: false };
}

/** What an edit changes: never the reward, never the payment details (12c). */
export interface LeagueEdit {
  readonly name: string;
  readonly description: string | null;
  readonly baseFee: number | null;
  readonly penaltyStep: number | null;
}

export interface NewInvite {
  readonly league: LeagueId;
  readonly invitee: PlayerId;
  readonly invitedBy: PlayerId;
}

export interface NewMember {
  readonly league: LeagueId;
  readonly player: PlayerId;
  readonly membership: { readonly isAdmin: false; readonly isGuest: false };
}

/** The player has no tournament to put a league in (issue 272). */
export type CreateRefusal = 'no-tournament';

/**
 * LeagueController::create after its form: the player founds a private
 * league in the tournament they are playing in, and is its owner and admin.
 * A player not registered for the tournament cannot have it as their
 * current one, so it is `no-tournament` too.
 */
export function createLeague(input: {
  readonly entry: LeagueEntry;
  readonly player: PlayerId;
  readonly tournament: Tournament | null;
  readonly isPlayerIn: boolean;
}): Result<NewLeague, CreateRefusal> {
  if (input.tournament === null || !input.isPlayerIn) {
    return refuse('no-tournament');
  }
  return ok({
    tournament: input.tournament.id,
    owner: input.player,
    name: input.entry.name,
    description: input.entry.description,
    baseFee: input.entry.baseFee,
    penaltyStep: input.entry.penaltyStep,
    reward: input.entry.reward,
    membership: { isAdmin: true, isGuest: false },
  });
}

/** sportbet answers 404: `firstOrFail` on the actor's admin membership. */
export type UpdateRefusal = 'not-an-admin';

/** The membership when it is an admin's, else null. */
const adminOf = (member: LeagueMember | null): LeagueMember | null =>
  member?.isAdmin === true ? member : null;

/** The invite when it is the actor's own, else null. */
const ownInvite = (
  invite: LeagueInvite | null,
  actor: PlayerId,
): LeagueInvite | null => (invite?.invitee === actor ? invite : null);

const editOf = (entry: LeagueEntry): LeagueEdit => ({
  name: entry.name,
  description: entry.description,
  baseFee: entry.baseFee,
  penaltyStep: entry.penaltyStep,
});

/**
 * LeagueController::update after its form: a league admin (the owner or a
 * former owner, R-105) changes the name, description and fees.
 */
export function updateLeague(input: {
  readonly league: League;
  readonly actorMember: LeagueMember | null;
  readonly entry: LeagueEntry;
}): Result<LeagueEdit, UpdateRefusal> {
  if (adminOf(input.actorMember) === null) return refuse('not-an-admin');
  return ok(editOf(input.entry));
}

/**
 * LeagueController::adminUpdate (sportbet #128, R-105): a superadmin edits
 * any league, the public one included, with the owner's own form and no
 * more - "parity with the owner is the requirement". The caller has read
 * the superadmin's role under its lock.
 */
export function superadminLeagueEdit(entry: LeagueEntry): LeagueEdit {
  return editOf(entry);
}

export type InviteRefusal =
  'not-an-admin' | 'already-member-or-invited' | 'not-in-tournament';

/**
 * LeagueController::invite: the actor must be an admin of the league (404),
 * the invitee neither a member nor already invited (an invite to oneself is
 * the admin's own membership), and (R-20) a player of the league's
 * tournament.
 */
export function inviteToLeague(input: {
  readonly league: League;
  readonly actorMember: LeagueMember | null;
  readonly invitee: PlayerId;
  readonly inviteeIsMember: boolean;
  readonly inviteeHasInvite: boolean;
  readonly inviteeInTournament: boolean;
}): Result<NewInvite, InviteRefusal> {
  const admin = adminOf(input.actorMember);
  if (admin === null) return refuse('not-an-admin');
  if (
    input.inviteeIsMember ||
    input.inviteeHasInvite ||
    input.invitee === admin.player
  ) {
    return refuse('already-member-or-invited');
  }
  if (!input.inviteeInTournament) return refuse('not-in-tournament');
  return ok({
    league: input.league.id,
    invitee: input.invitee,
    invitedBy: admin.player,
  });
}

/** `not-your-invite` is a 404; `not-in-tournament` (R-20) leaves the invite pending. */
export type AcceptRefusal = 'not-your-invite' | 'not-in-tournament';

/**
 * LeagueController::acceptInvite: the invite must be the actor's, and
 * (R-20) the actor a player of its league's tournament. The new member is a
 * plain one: not an admin, not a guest.
 */
export function acceptInvite(input: {
  readonly invite: LeagueInvite | null;
  readonly actor: PlayerId;
  readonly inTournament: boolean;
}): Result<NewMember, AcceptRefusal> {
  const invite = ownInvite(input.invite, input.actor);
  if (invite === null) return refuse('not-your-invite');
  if (!input.inTournament) return refuse('not-in-tournament');
  return ok({
    league: invite.league,
    player: input.actor,
    membership: { isAdmin: false, isGuest: false },
  });
}

/** LeagueController::declineInvite: only the invitee's own invite. */
export function declineInvite(input: {
  readonly invite: LeagueInvite | null;
  readonly actor: PlayerId;
}): Result<void, 'not-your-invite'> {
  return ownInvite(input.invite, input.actor) === null
    ? refuse('not-your-invite')
    : ok(undefined);
}

export type LeaveRefusal = 'public' | 'owner' | 'only-league' | 'not-a-member';

/**
 * LeagueController::leaveLeague: not the public league, not as its owner, not
 * the player's only league in this tournament (R-29), and a member (404). A league whose owner's account is gone may be left.
 * Leaving the selected league selects the tournament's public one.
 */
export function leaveLeague(input: {
  readonly league: League;
  readonly actor: PlayerId;
  readonly member: LeagueMember | null;
  readonly otherLeaguesInTournament: number;
  readonly selectsIt: boolean;
}): Result<{ readonly selectPublic: boolean }, LeaveRefusal> {
  const { kind } = input.league;
  if (kind.public) return refuse('public');
  if (kind.owner === input.actor) return refuse('owner');
  if (input.otherLeaguesInTournament === 0) return refuse('only-league');
  if (input.member === null) return refuse('not-a-member');
  return ok({ selectPublic: input.selectsIt });
}

/**
 * sportbet answers 403, and it does so for the public league too: that has
 * no owner, so its "Viešos lygos ištrinti negalima" branch is never reached.
 */
export type DeleteRefusal = 'not-owner';

/**
 * LeagueController::deleteLeague: only the owner. Every player selecting the
 * league is moved to the tournament's public league first.
 */
export function deleteLeague(input: {
  readonly league: League;
  readonly actor: PlayerId;
  readonly selectingPlayers: readonly PlayerId[];
}): Result<{ readonly moveToPublic: readonly PlayerId[] }, DeleteRefusal> {
  const { kind } = input.league;
  if (kind.public || kind.owner !== input.actor) return refuse('not-owner');
  return ok({ moveToPublic: input.selectingPlayers });
}

/** LeagueController::adminDelete: "Viešos lygos ištrinti negalima". */
export type SuperadminDeleteRefusal = 'public';

/**
 * LeagueController::adminDelete (R-118, confirmed by an emailed code before
 * it gets here): a superadmin ends any private league, whoever owns it or
 * whether anyone does. Every player selecting it is moved to the
 * tournament's public league first, as the owner's delete does.
 */
export function superadminDeleteLeague(input: {
  readonly league: League;
  readonly selectingPlayers: readonly PlayerId[];
}): Result<
  { readonly moveToPublic: readonly PlayerId[] },
  SuperadminDeleteRefusal
> {
  if (input.league.kind.public) return refuse('public');
  return ok({ moveToPublic: input.selectingPlayers });
}

export type TransferRefusal =
  'public' | 'not-owner' | 'not-a-member' | 'already-owner';

/**
 * R-23 (new, no sportbet rule): the owner hands a private league to another
 * member, who becomes its owner and an admin (R-105). The former owner stays
 * an admin member and may then leave like anyone else.
 */
export function transferLeague(input: {
  readonly league: League;
  readonly actor: PlayerId;
  readonly to: LeagueMember | null;
}): Result<
  { readonly owner: PlayerId; readonly admin: PlayerId },
  TransferRefusal
> {
  const { kind } = input.league;
  if (kind.public) return refuse('public');
  if (kind.owner !== input.actor) return refuse('not-owner');
  if (input.to === null) return refuse('not-a-member');
  if (input.to.player === input.actor) return refuse('already-owner');
  return ok({ owner: input.to.player, admin: input.to.player });
}
