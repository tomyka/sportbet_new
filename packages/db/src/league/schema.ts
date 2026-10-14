import {
  leagueFeeInvariant,
  leagueNameInvariant,
  messageTextInvariant,
  paidCentsInvariant,
  paymentBeneficiaryInvariant,
  paymentIbanInvariant,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/players';
import { tournaments } from '../tournament/schema';

/**
 * A league of one tournament (sportbet's `leagues`): every tournament has
 * exactly one public league, with no owner, which every player is a member
 * of; private leagues are made by players. Money is whole euros here and
 * cents on a member (R-88, issue #29).
 */
export const leagues = pgTable(
  'leagues',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isPublic: boolean('is_public').notNull().default(false),
    /** Null for the public league, and once the owner's account is gone. */
    ownerId: integer('owner_id'),
    baseFee: integer('base_fee'),
    penaltyStep: integer('penalty_step'),
    rewardDescription: text('reward_description'),
    paymentBeneficiary: text('payment_beneficiary'),
    paymentIban: text('payment_iban'),
    paymentNote: text('payment_note'),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'leagues_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'leagues_owner_fk',
      columns: [table.ownerId],
      foreignColumns: [players.id],
    }).onDelete('set null'),
    // The target of a selection's foreign key: a league of this tournament.
    unique('leagues_id_tournament_unique').on(table.id, table.tournamentId),
    // One public league per tournament.
    uniqueIndex('leagues_one_public_per_tournament')
      .on(table.tournamentId)
      .where(sql`${table.isPublic}`),
    index('leagues_tournament_idx').on(table.tournamentId),
    check(
      'leagues_public_has_no_owner',
      sql`not ${table.isPublic} or ${table.ownerId} is null`,
    ),
    ...leagueInvariantChecks.map(invariantCheck),
  ],
);

/**
 * A player in a league (sportbet's `league_members`). The id is sportbet's,
 * kept (the payments form posts it); a guest sees and is seen by everyone
 * (R-87), a full member only by full members.
 */
export const leagueMembers = pgTable(
  'league_members',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    leagueId: integer('league_id').notNull(),
    playerId: integer('player_id').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    isGuest: boolean('is_guest').notNull().default(false),
    /** The amount paid, in cents; null is not paid yet. */
    paidCents: integer('paid_cents'),
    /** R-25's seniority: sportbet's created_at, which it allows to be null. */
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'league_members_league_fk',
      columns: [table.leagueId],
      foreignColumns: [leagues.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'league_members_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    // Also the target of a selection's foreign key (tournament_players).
    unique('league_members_league_player_unique').on(
      table.leagueId,
      table.playerId,
    ),
    index('league_members_player_idx').on(table.playerId),
    ...leagueMemberInvariantChecks.map(invariantCheck),
  ],
);

/** A pending invitation: only pending ones are stored (sportbet deletes the rest). */
export const leagueInvites = pgTable(
  'league_invites',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    leagueId: integer('league_id').notNull(),
    inviteeId: integer('invitee_id').notNull(),
    invitedById: integer('invited_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'league_invites_league_fk',
      columns: [table.leagueId],
      foreignColumns: [leagues.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'league_invites_invitee_fk',
      columns: [table.inviteeId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'league_invites_invited_by_fk',
      columns: [table.invitedById],
      foreignColumns: [players.id],
    }).onDelete('set null'),
    unique('league_invites_league_invitee_unique').on(
      table.leagueId,
      table.inviteeId,
    ),
    index('league_invites_invitee_idx').on(table.inviteeId),
  ],
);

/** A message the dashboard lists for a league; detached when its league goes. */
export const messages = pgTable(
  'messages',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    leagueId: integer('league_id'),
    text: text('text').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'messages_league_fk',
      columns: [table.leagueId],
      foreignColumns: [leagues.id],
    }).onDelete('set null'),
    index('messages_league_idx').on(table.leagueId),
    ...messageInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `leagues`: each holds a domain invariant. */
export const leagueInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'leagues_name_length',
    column: leagues.name,
    invariant: leagueNameInvariant,
    sweep: 'every BMP character',
  },
  {
    constraint: 'leagues_base_fee_range',
    column: leagues.baseFee,
    invariant: leagueFeeInvariant,
  },
  {
    constraint: 'leagues_penalty_step_range',
    column: leagues.penaltyStep,
    invariant: leagueFeeInvariant,
  },
  {
    constraint: 'leagues_payment_beneficiary_length',
    column: leagues.paymentBeneficiary,
    invariant: paymentBeneficiaryInvariant,
  },
  {
    constraint: 'leagues_payment_iban_length',
    column: leagues.paymentIban,
    invariant: paymentIbanInvariant,
  },
];

/** Every CHECK on `league_members`: each holds a domain invariant. */
export const leagueMemberInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'league_members_paid_cents_range',
    column: leagueMembers.paidCents,
    invariant: paidCentsInvariant,
  },
];

/** Every CHECK on `messages`: each holds a domain invariant. */
export const messageInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'messages_text_length',
    column: messages.text,
    invariant: messageTextInvariant,
    sweep: 'every BMP character',
  },
];
