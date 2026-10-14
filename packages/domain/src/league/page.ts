import type { PlayerId } from '../shared/ids';
import type { League, LeagueId, LeagueMember } from './league';

/** A player as the page names them: the account's name and surname, and username. */
export interface LeaguePerson {
  readonly player: PlayerId;
  readonly name: string;
  readonly surname: string;
  readonly username: string;
}

/**
 * One of the viewer's leagues in the tournament, as the database reads it.
 * `members` and `pendingInvitees` are read only for a league the viewer
 * administers; the page drops them otherwise as well.
 */
export interface LeagueRows {
  readonly league: League;
  readonly viewerMember: LeagueMember;
  /** The viewer's selection in the tournament is this league. */
  readonly selected: boolean;
  /** Every member, `$league->members()->count()`. */
  readonly memberCount: number;
  readonly members: readonly (LeaguePerson & { readonly isAdmin: boolean })[];
  readonly pendingInvitees: readonly LeaguePerson[];
}

/** A pending invite of the viewer's, in any tournament (issue 183). */
export interface PendingInvite {
  readonly id: number;
  readonly leagueName: string;
  readonly inviterUsername: string | null;
}

export interface PersonLine {
  /** `trim(name . ' ' . surname)`. */
  readonly display: string;
  readonly username: string;
}

/** What a league's card lets the viewer do (index.blade.php). */
export interface LeagueMay {
  readonly switch: boolean;
  readonly invite: boolean;
  readonly edit: boolean;
  /** The edit dialog's delete: the owner of a private league. */
  readonly delete: boolean;
  readonly leave: boolean;
}

export interface LeagueCard {
  readonly id: LeagueId;
  readonly name: string;
  readonly description: string | null;
  /** The stored fees, whole euros: the edit dialog's prefill. */
  readonly baseFee: number | null;
  readonly penaltyStep: number | null;
  readonly memberCount: number;
  readonly selected: boolean;
  readonly isOwner: boolean;
  readonly isPublic: boolean;
  readonly may: LeagueMay;
  /** Only an admin's card names its members and pending invitees. */
  readonly people: {
    readonly members: readonly (PersonLine & {
      readonly player: PlayerId;
      readonly isAdmin: boolean;
    })[];
    readonly pending: readonly PersonLine[];
  } | null;
}

export interface InviteCard {
  readonly id: number;
  readonly leagueName: string;
  /** The inviter's username, `-` once their account is gone. */
  readonly invitedBy: string;
}

export interface LeaguesPage {
  readonly mine: readonly LeagueCard[];
  readonly invites: readonly InviteCard[];
}

const lineOf = (person: LeaguePerson): PersonLine => ({
  display: `${person.name} ${person.surname}`.trim(),
  username: person.username,
});

function cardOf(
  rows: LeagueRows,
  viewer: PlayerId,
  leaguesInTournament: number,
): LeagueCard {
  const { league, viewerMember } = rows;
  const isOwner = !league.kind.public && league.kind.owner === viewer;
  const admin = viewerMember.isAdmin;
  return {
    id: league.id,
    name: league.name,
    description: league.description,
    baseFee: league.fee.base,
    penaltyStep: league.fee.penaltyStep,
    memberCount: rows.memberCount,
    selected: rows.selected,
    isOwner,
    isPublic: league.kind.public,
    may: {
      switch: !rows.selected,
      invite: admin,
      edit: admin,
      delete: isOwner,
      leave: !league.kind.public && !isOwner && leaguesInTournament > 1,
    },
    people: admin
      ? {
          members: rows.members.map((member) => ({
            ...lineOf(member),
            player: member.player,
            isAdmin: member.isAdmin,
          })),
          pending: rows.pendingInvitees.map(lineOf),
        }
      : null,
  };
}

/**
 * `/leagues` (LeagueController::index): the viewer's leagues in the
 * tournament by membership id and their pending invites, in every
 * tournament, by invite id, each league with what the viewer may do there.
 * An admin's card names the members and pending invitees; any other card
 * names no one (sportbet eager-loads them into every card).
 */
export function leaguesPage(input: {
  readonly leagues: readonly LeagueRows[];
  readonly invites: readonly PendingInvite[];
  readonly viewer: PlayerId;
}): LeaguesPage {
  const mine = input.leagues.toSorted(
    (a, b) => a.viewerMember.id - b.viewerMember.id,
  );
  return {
    mine: mine.map((rows) => cardOf(rows, input.viewer, mine.length)),
    invites: input.invites
      .toSorted((a, b) => a.id - b.id)
      .map((invite) => ({
        id: invite.id,
        leagueName: invite.leagueName,
        invitedBy: invite.inviterUsername ?? '-',
      })),
  };
}
