import { z } from 'zod';
import type { PlayerId, TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  leagueFeeInvariant,
  leagueNameInvariant,
  messageTextInvariant,
  paidCentsInvariant,
  paymentBeneficiaryInvariant,
  paymentIbanInvariant,
} from './invariants';

/** A database id: a positive whole number an integer column holds. */
const databaseIdSchema = z.int().positive().max(2_147_483_647);
export const leagueIdSchema = databaseIdSchema.brand<'LeagueId'>();
const centsSchema = paidCentsInvariant.schema.brand<'Cents'>();

export type LeagueId = z.infer<typeof leagueIdSchema>;
/** An amount of money in cents: whole, from 0, as a `decimal(8,2)` holds it. */
export type Cents = z.infer<typeof centsSchema>;

export function leagueId(
  value: number,
): Result<LeagueId, 'not-a-positive-integer'> {
  const parsed = leagueIdSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('not-a-positive-integer');
}

export function cents(value: number): Result<Cents, 'not-cents'> {
  const parsed = centsSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('not-cents');
}

/** A league of one tournament: sportbet's `leagues` row. */
export interface League {
  readonly id: LeagueId;
  readonly tournament: TournamentId;
  readonly name: string;
  readonly description: string | null;
  /** The public league has no owner (sportbet: owner_id null, is_public). */
  readonly kind:
    | { readonly public: true }
    | { readonly public: false; readonly owner: PlayerId | null };
  readonly fee: {
    readonly base: number | null;
    readonly penaltyStep: number | null;
    readonly reward: string | null;
  };
  readonly payment: {
    readonly beneficiary: string | null;
    readonly iban: string | null;
    readonly note: string | null;
  };
  readonly createdAt: Instant | null;
}

/** A player in a league: sportbet's `league_members` row. */
export interface LeagueMember {
  readonly id: number;
  readonly league: LeagueId;
  readonly player: PlayerId;
  readonly isAdmin: boolean;
  readonly isGuest: boolean;
  readonly paid: Cents | null;
  /** R-25's "longest-standing": sportbet's created_at (nullable), then id. */
  readonly joinedAt: Instant | null;
}

/** A pending invitation: only pending ones are stored. */
export interface LeagueInvite {
  readonly id: number;
  readonly league: LeagueId;
  readonly invitee: PlayerId;
  readonly invitedBy: PlayerId | null;
  readonly createdAt: Instant | null;
}

/** A message the dashboard lists for a league; detached when its league goes. */
export interface LeagueMessage {
  readonly id: number;
  readonly league: LeagueId | null;
  readonly text: string;
  readonly active: boolean;
}

export type LeagueRefusal =
  'name' | 'base-fee' | 'penalty-step' | 'beneficiary' | 'iban';

const optional = <T>(schema: z.ZodType<T>, value: T | null): boolean =>
  value === null || schema.safeParse(value).success;

/** The first field of a league row a column's invariant refuses, if any. */
function brokenLeagueField(league: League): LeagueRefusal | null {
  const checks: readonly (readonly [LeagueRefusal, boolean])[] = [
    ['name', leagueNameInvariant.schema.safeParse(league.name).success],
    ['base-fee', optional(leagueFeeInvariant.schema, league.fee.base)],
    [
      'penalty-step',
      optional(leagueFeeInvariant.schema, league.fee.penaltyStep),
    ],
    [
      'beneficiary',
      optional(paymentBeneficiaryInvariant.schema, league.payment.beneficiary),
    ],
    ['iban', optional(paymentIbanInvariant.schema, league.payment.iban)],
  ];
  return checks.find(([, holds]) => !holds)?.[0] ?? null;
}

/** A stored league read back: refused by the field a column's rule refuses. */
export function storedLeague(league: League): Result<League, LeagueRefusal> {
  const broken = brokenLeagueField(league);
  return broken === null ? ok(league) : refuse(broken);
}

/** A stored member read back: refused when its id is no database id. */
export function storedLeagueMember(
  member: LeagueMember,
): Result<LeagueMember, 'id'> {
  return databaseIdSchema.safeParse(member.id).success
    ? ok(member)
    : refuse('id');
}

/** A stored invite read back: refused when its id is no database id. */
export function storedLeagueInvite(
  invite: LeagueInvite,
): Result<LeagueInvite, 'id'> {
  return databaseIdSchema.safeParse(invite.id).success
    ? ok(invite)
    : refuse('id');
}

/** A stored message read back: its id, then its text. */
export function storedLeagueMessage(
  message: LeagueMessage,
): Result<LeagueMessage, 'id' | 'text'> {
  if (!databaseIdSchema.safeParse(message.id).success) return refuse('id');
  return messageTextInvariant.schema.safeParse(message.text).success
    ? ok(message)
    : refuse('text');
}
