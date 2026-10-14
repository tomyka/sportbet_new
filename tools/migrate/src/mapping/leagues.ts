import { playerOf, type SavedLeague } from '@sportbet/db';
import {
  sportbetColumns,
  tournamentId,
  type League,
  type LeagueInvite,
  type LeagueMember,
  type LeagueMessage,
  type SportbetLeagueMemberRow,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { SportbetRow } from '../read-columns';
import type { MappedUsers } from './accounts';
import {
  firstBlocked,
  inherit,
  LOADED,
  must,
  PerTournament,
  refused,
  type Fate,
  type MapContext,
} from './ledger';

// The leagues (#29): the leagues of a loaded tournament, their members (who
// also say who plays it), the pending invites and the messages.

export interface MappedLeagues {
  /** Each loaded league's tournament. */
  readonly tournamentOf: Map<number, number>;
  /** Each tournament's league members (sportbet user ids). */
  readonly members: PerTournament<number>;
  /** Each loaded league, as the domain's, with its loaded members. */
  readonly saved: Map<number, SavedLeague>;
  /** The ids of the member rows sportbet marks `active` (the selected league). */
  readonly active: ReadonlySet<number>;
  /** Each loaded league's fate, for the rows that depend on it. */
  readonly fates: ReadonlyMap<number, Fate>;
}

const ownerOf = (owner: number | null, users: MappedUsers) =>
  owner === null || !users.users.has(owner) ? null : playerOf(owner);

/** Why a mapped league cannot load beside the ones before it, if it cannot. */
function secondPublic(
  league: League,
  tournament: number,
  publicOf: Map<number, number>,
): string | null {
  if (!league.kind.public) return null;
  if (publicOf.has(tournament)) return 'second-public-league';
  publicOf.set(tournament, league.id);
  return null;
}

/** leagues: a league of a loaded tournament, mapped through the domain, and each one's fate. */
function mapLeagueRows(
  ctx: MapContext,
  parents: {
    readonly tournamentFates: ReadonlyMap<number, Fate>;
    readonly users: MappedUsers;
  },
): {
  tournamentOf: Map<number, number>;
  fates: Map<number, Fate>;
  leagues: Map<number, League>;
} {
  const { ledger } = ctx;
  const tournamentOf = new Map<number, number>();
  const fates = new Map<number, Fate>();
  const leagues = new Map<number, League>();
  const publicOf = new Map<number, number>();
  for (const row of ctx.rows.leagues) {
    const parent = parents.tournamentFates.get(row.tournament_id);
    const name = `id ${String(row.id)}`;
    if (!ledger.follow('leagues', parent, name)) {
      fates.set(
        row.id,
        parent === undefined ? refused('orphan') : inherit(parent),
      );
      continue;
    }
    const mapped = sportbetColumns.league({
      id: row.id,
      tournament: must(
        tournamentId(String(row.tournament_id)),
        'tournament id',
      ),
      name: row.name,
      description: row.description,
      is_public: row.is_public,
      owner: ownerOf(row.owner_id, parents.users),
      base_fee: row.base_fee,
      penalty_step: row.penalty_step,
      reward_description: row.reward_description,
      payment_beneficiary: row.payment_beneficiary,
      payment_iban: row.payment_iban,
      payment_note: row.payment_note,
      created_at: row.created_at,
    });
    const reason = mapped.ok
      ? secondPublic(mapped.value, row.tournament_id, publicOf)
      : mapped.refusal;
    if (!mapped.ok || reason !== null) {
      const why = reason ?? 'bad-league';
      fates.set(row.id, refused(why));
      ledger.refuse('leagues', why, name);
      continue;
    }
    tournamentOf.set(row.id, row.tournament_id);
    leagues.set(row.id, mapped.value);
    fates.set(row.id, LOADED);
    ledger.load('leagues');
  }
  return { tournamentOf, fates, leagues };
}

/** A `league_members` row, read as the domain's raw row. */
const memberRowOf = (
  row: SportbetRow<'league_members'>,
): SportbetLeagueMemberRow => ({
  id: row.id,
  league: row.league_id,
  player: playerOf(row.user_id),
  is_admin: row.is_admin,
  is_guest: row.is_guest,
  paid_amount: row.paid_amount,
  created_at: row.created_at,
});

/**
 * A private league keeps its owner only while the owner is one of its
 * members (the owner's account loads only because it plays): the count of
 * owners dropped is a notice.
 */
function withMemberOwners(
  leagues: ReadonlyMap<number, League>,
  members: ReadonlyMap<number, LeagueMember[]>,
): { saved: Map<number, SavedLeague>; dropped: number } {
  let dropped = 0;
  const saved = new Map<number, SavedLeague>();
  for (const [id, league] of leagues) {
    const own = members.get(id) ?? [];
    const owner = league.kind.public ? null : league.kind.owner;
    const keeps = owner === null || own.some(({ player }) => player === owner);
    if (!keeps) dropped += 1;
    saved.set(id, {
      league: keeps
        ? league
        : { ...league, kind: { public: false, owner: null } },
      members: own,
    });
  }
  return { saved, dropped };
}

/** leagues and league_members: who plays a tournament, and the leagues themselves. */
export function mapLeagues(
  ctx: MapContext,
  parents: {
    readonly tournamentFates: ReadonlyMap<number, Fate>;
    readonly users: MappedUsers;
  },
): MappedLeagues {
  const { ledger } = ctx;
  const leagues = mapLeagueRows(ctx, parents);
  const members = new PerTournament<number>();
  const membersOf = new Map<number, LeagueMember[]>();
  const active = new Set<number>();
  for (const row of ctx.rows.league_members) {
    const blocked = firstBlocked([
      leagues.fates.get(row.league_id),
      parents.users.fates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('league_members', blocked.fate, '');
      continue;
    }
    const mapped = sportbetColumns.leagueMember(memberRowOf(row));
    if (!mapped.ok) {
      ledger.refuse('league_members', mapped.refusal, `id ${String(row.id)}`);
      continue;
    }
    const tournament = leagues.tournamentOf.get(row.league_id);
    if (tournament === undefined) {
      throw new ReaderProblem('map: a league is missing');
    }
    members.add(tournament, row.user_id);
    membersOf.set(row.league_id, [
      ...(membersOf.get(row.league_id) ?? []),
      mapped.value,
    ]);
    if (row.active !== 0) active.add(row.id);
    ledger.load('league_members');
  }
  const owned = withMemberOwners(leagues.leagues, membersOf);
  if (owned.dropped > 0) {
    ctx.notices.push(
      `leagues: ${String(owned.dropped)} private leagues whose owner is not a member lose the owner`,
    );
  }
  return {
    tournamentOf: leagues.tournamentOf,
    members,
    saved: owned.saved,
    active,
    fates: leagues.fates,
  };
}

/**
 * league_invites: only pending ones are stored (sportbet deletes an
 * accepted or declined one's row's meaning with its status; the reader
 * skips them), for a loaded league and an invitee who is loaded; an
 * inviter who is not loaded is none (`SET NULL`).
 */
export function mapInvites(
  ctx: MapContext,
  parents: {
    readonly leagues: MappedLeagues;
    readonly users: MappedUsers;
    readonly loadedUsers: ReadonlySet<number>;
  },
): LeagueInvite[] {
  const { ledger } = ctx;
  const invites: LeagueInvite[] = [];
  let withoutInviter = 0;
  for (const row of ctx.rows.league_invites) {
    if (row.status !== 'pending') {
      ledger.skip('league_invites', 'not-pending');
      continue;
    }
    const blocked = firstBlocked([
      parents.leagues.fates.get(row.league_id),
      parents.users.fates.get(row.invited_user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('league_invites', blocked.fate, '');
      continue;
    }
    if (!parents.loadedUsers.has(row.invited_user_id)) {
      ledger.skip('league_invites', 'invitee-not-loaded');
      continue;
    }
    const inviter =
      row.invited_by_id !== null && parents.loadedUsers.has(row.invited_by_id)
        ? playerOf(row.invited_by_id)
        : null;
    if (inviter === null) withoutInviter += 1;
    const mapped = sportbetColumns.leagueInvite({
      id: row.id,
      league: row.league_id,
      invitee: playerOf(row.invited_user_id),
      invited_by: inviter,
      created_at: row.created_at,
    });
    if (!mapped.ok) {
      ledger.refuse('league_invites', mapped.refusal, `id ${String(row.id)}`);
      continue;
    }
    invites.push(mapped.value);
    ledger.load('league_invites');
  }
  if (withoutInviter > 0) {
    ctx.notices.push(
      `league_invites: ${String(withoutInviter)} pending invites with no inviter loaded`,
    );
  }
  return invites;
}

/** messages: a message of a loaded league, or one with no league (detached as sportbet does). */
export function mapMessages(
  ctx: MapContext,
  parents: { readonly leagues: MappedLeagues },
): LeagueMessage[] {
  const { ledger } = ctx;
  const messages: LeagueMessage[] = [];
  for (const row of ctx.rows.messages) {
    if (
      row.league_id !== null &&
      !ledger.follow(
        'messages',
        parents.leagues.fates.get(row.league_id),
        `id ${String(row.id)}`,
      )
    ) {
      continue;
    }
    const mapped = sportbetColumns.message({
      id: row.id,
      league: row.league_id,
      message: row.message,
      active: row.active,
    });
    if (!mapped.ok) {
      ledger.refuse('messages', mapped.refusal, `id ${String(row.id)}`);
      continue;
    }
    messages.push(mapped.value);
    ledger.load('messages');
  }
  return messages;
}
