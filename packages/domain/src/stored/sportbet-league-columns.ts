import {
  cents,
  leagueId,
  storedLeague,
  storedLeagueInvite,
  storedLeagueMember,
  storedLeagueMessage,
  type League,
  type LeagueInvite,
  type LeagueMember,
  type LeagueMessage,
} from '../league/league';
import { decimalUnits } from '../points/fixed-point';
import { instantFrom, type Instant } from '../shared/instant';
import { refuse, type Result } from '../shared/result';
import type {
  SportbetLeagueInviteRow,
  SportbetLeagueMemberRefusal,
  SportbetLeagueMemberRow,
  SportbetLeagueRefusal,
  SportbetLeagueRow,
  SportbetMessageRow,
} from './sportbet-rows';

/**
 * A MySQL `timestamp` read as text (`YYYY-MM-DD HH:MM:SS`, UTC) as an
 * instant. sportbet allows it null, and nothing but R-25's seniority reads
 * it, so a value that is no timestamp is read as none, not refused.
 */
function timestampColumn(value: string | null): Instant | null {
  if (value === null) return null;
  const instant = instantFrom(`${value.replace(' ', 'T')}Z`);
  return instant.ok ? instant.value : null;
}

/**
 * sportbet's `leagues`, `league_members`, `league_invites` and `messages`
 * read into the domain's stored rows: part of sportbetColumns
 * (sportbet-columns.ts).
 *
 * - `leagues`: a public league has no owner here (sportbet's firstOrCreate
 *   makes none), so one with an owner is refused, not stripped of it;
 *   `name` is up to 255 characters, as its column; a private league whose
 *   owner is gone (nullOnDelete, and every migrated group) keeps a null owner.
 * - `league_members`: `is_admin` and `is_guest` read with `!= 0`, as
 *   `is_guest <= viewer` does; `paid_amount` is exact text to cents (no
 *   float), null unpaid.
 * - `messages`: `active` read with `!= 0`.
 */
export const sportbetLeagueColumns = Object.freeze({
  league(row: SportbetLeagueRow): Result<League, SportbetLeagueRefusal> {
    const id = leagueId(row.id);
    if (!id.ok) return refuse('bad-id');
    const isPublic = row.is_public !== 0;
    if (isPublic && row.owner !== null) return refuse('public-has-owner');
    return storedLeague({
      id: id.value,
      tournament: row.tournament,
      name: row.name,
      description: row.description,
      kind: isPublic ? { public: true } : { public: false, owner: row.owner },
      fee: {
        base: row.base_fee,
        penaltyStep: row.penalty_step,
        reward: row.reward_description,
      },
      payment: {
        beneficiary: row.payment_beneficiary,
        iban: row.payment_iban,
        note: row.payment_note,
      },
      createdAt: timestampColumn(row.created_at),
    });
  },

  leagueMember(
    row: SportbetLeagueMemberRow,
  ): Result<LeagueMember, SportbetLeagueMemberRefusal> {
    const league = leagueId(row.league);
    if (!league.ok) return refuse('bad-id');
    let paid: LeagueMember['paid'] = null;
    if (row.paid_amount !== null) {
      const hundredths = decimalUnits(row.paid_amount, 2);
      const amount = hundredths.ok ? cents(hundredths.value) : null;
      if (!amount?.ok) return refuse('bad-paid-amount');
      paid = amount.value;
    }
    const member = storedLeagueMember({
      id: row.id,
      league: league.value,
      player: row.player,
      isAdmin: row.is_admin !== 0,
      isGuest: row.is_guest !== 0,
      paid,
      joinedAt: timestampColumn(row.created_at),
    });
    return member.ok ? member : refuse('bad-id');
  },

  leagueInvite(row: SportbetLeagueInviteRow): Result<LeagueInvite, 'bad-id'> {
    const league = leagueId(row.league);
    if (!league.ok) return refuse('bad-id');
    const invite = storedLeagueInvite({
      id: row.id,
      league: league.value,
      invitee: row.invitee,
      invitedBy: row.invited_by,
      createdAt: timestampColumn(row.created_at),
    });
    return invite.ok ? invite : refuse('bad-id');
  },

  message(
    row: SportbetMessageRow,
  ): Result<LeagueMessage, 'bad-id' | 'bad-text'> {
    let league: LeagueMessage['league'] = null;
    if (row.league !== null) {
      const id = leagueId(row.league);
      if (!id.ok) return refuse('bad-id');
      league = id.value;
    }
    const message = storedLeagueMessage({
      id: row.id,
      league,
      text: row.message,
      active: row.active !== 0,
    });
    return message.ok
      ? message
      : refuse(message.refusal === 'id' ? 'bad-id' : 'bad-text');
  },
});
