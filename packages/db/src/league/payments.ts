import {
  accountFullName,
  isSuperadmin,
  mayManagePayments,
  ok,
  paymentsPage,
  paymentTotals,
  personNameInvariant,
  recordPayments,
  refuse,
  usernameInvariant,
  type DetailsEntry,
  type LeagueId,
  type LeagueMember,
  type PaymentsEntry,
  type PaymentsMember,
  type PaymentsPage,
  type PaymentsRefusal,
  type PaymentTotals,
  type PlayerId,
  type Result,
  type RuleSet,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { findRole, lockRoleShared } from '../account/superadmins';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { players } from '../player/players';
import { memberColumns, memberRows, readMember } from './list';
import { findLeague, lockLeague, lockMember, lockMembers } from './locked';
import { leagueMembers, leagues } from './schema';

type PaymentsAnswer<T, R extends string = never> = Result<
  T,
  PaymentsRefusal | 'no-such-league' | R
>;

/**
 * Who is at the payments door: a league's own admin (their membership read
 * now, never from the session), or - the admin door, LeaguePaymentController::
 * adminEdit - a superadmin working on `tournament`, whose role is read now
 * too, who needs no membership and may open the public league's payments
 * (the only way into them), but only for a league of that tournament.
 */
export type PaymentsActor =
  PlayerId | { readonly superadmin: PlayerId; readonly tournament: number };

interface Door {
  readonly player: PlayerId;
  readonly superadmin: boolean;
  /** The one tournament a superadmin's door opens; null for a league admin's own. */
  readonly tournament: number | null;
}

/** The actor at the door, or `not-an-admin` for a "superadmin" who is none. */
async function doorOf(
  db: Executor,
  actor: PaymentsActor,
  locking: boolean,
): Promise<Result<Door, 'not-an-admin'>> {
  if (typeof actor === 'string') {
    return ok({ player: actor, superadmin: false, tournament: null });
  }
  const role = locking
    ? await lockRoleShared(db, actor.superadmin)
    : await findRole(db, actor.superadmin);
  return role !== null && isSuperadmin(role)
    ? ok({
        player: actor.superadmin,
        superadmin: true,
        tournament: actor.tournament,
      })
    : refuse('not-an-admin');
}

const opensLeagueOf = (door: Door, tournament: number): boolean =>
  door.tournament === null || door.tournament === tournament;

const asActor = (
  members: readonly LeagueMember[],
  door: Door,
): LeagueMember | null =>
  door.superadmin
    ? null
    : (members.find((member) => member.player === door.player) ?? null);

/**
 * LeaguePaymentController::update: what each posted member paid. One
 * transaction under the lock order: the league row `FOR SHARE` (a delete
 * waits its turn), then the league's members `FOR UPDATE` by player, the
 * actor's own row among them (authority is read here, never from the
 * session). `recordPayments` decides - the public league and a plain member
 * are refused, every posted id must be a member of this league - and a
 * refusal writes nothing. No tournament, game or prediction lock, no
 * recalculation: payments touch no points. The answer is the totals from the
 * rows just written (`paymentTotals`, the pots under `rules`, R-88).
 */
export async function savePayments(
  db: Executor,
  save: {
    readonly actor: PaymentsActor;
    readonly league: LeagueId;
    readonly entry: PaymentsEntry;
    readonly rules: RuleSet;
  },
): Promise<PaymentsAnswer<PaymentTotals, 'unknown-member'>> {
  return db.transaction(
    async (tx): Promise<PaymentsAnswer<PaymentTotals, 'unknown-member'>> => {
      const door = await doorOf(tx, save.actor, true);
      if (!door.ok) return door;
      const locked = await lockLeague(tx, save.league, 'share');
      if (locked === null || !opensLeagueOf(door.value, locked.tournament)) {
        return refuse('no-such-league');
      }
      const members = await lockMembers(tx, save.league);
      const decided = recordPayments({
        league: locked.league,
        actorMember: asActor(members, door.value),
        superadmin: door.value.superadmin,
        members,
        entry: save.entry,
      });
      if (!decided.ok) return decided;
      for (const { member, paid } of decided.value) {
        await tx
          .update(leagueMembers)
          .set({ paidCents: paid })
          .where(eq(leagueMembers.id, member));
      }
      const written = new Map(
        decided.value.map(({ member, paid }) => [member, paid]),
      );
      return ok(
        paymentTotals({
          league: locked.league,
          members: members.map((member) =>
            written.has(member.id)
              ? { ...member, paid: written.get(member.id) ?? null }
              : member,
          ),
          rules: save.rules,
        }),
      );
    },
  );
}

/**
 * LeaguePaymentController::updateDetails: where the fee is to be sent. One
 * transaction: the league row `FOR UPDATE`, then the actor's membership
 * `FOR SHARE`; `mayManagePayments` decides, and the three columns are
 * written as given (null for a blank box, the IBAN already compact).
 */
export async function saveDetails(
  db: Executor,
  save: {
    readonly actor: PaymentsActor;
    readonly league: LeagueId;
    readonly entry: DetailsEntry;
  },
): Promise<PaymentsAnswer<void>> {
  return db.transaction(async (tx): Promise<PaymentsAnswer<void>> => {
    const door = await doorOf(tx, save.actor, true);
    if (!door.ok) return door;
    const locked = await lockLeague(tx, save.league, 'update');
    if (locked === null || !opensLeagueOf(door.value, locked.tournament)) {
      return refuse('no-such-league');
    }
    const allowed = mayManagePayments({
      league: locked.league,
      actorMember: door.value.superadmin
        ? null
        : await lockMember(tx, save.league, door.value.player, 'share'),
      superadmin: door.value.superadmin,
    });
    if (!allowed.ok) return allowed;
    await tx
      .update(leagues)
      .set({
        paymentBeneficiary: save.entry.beneficiary,
        paymentIban: save.entry.iban,
        paymentNote: save.entry.note,
      })
      .where(eq(leagues.id, save.league));
    return ok(undefined);
  });
}

const accountRows = z.array(
  z.object({
    member: memberRows.element,
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
    username: usernameInvariant.schema,
  }),
);
const ownerRows = z.array(
  z.object({
    name: personNameInvariant.schema,
    surname: personNameInvariant.schema,
  }),
);

async function accountsOf(
  db: Executor,
  league: LeagueId,
): Promise<PaymentsMember[]> {
  return accountRows
    .parse(
      await db
        .select({
          member: memberColumns,
          name: players.name,
          surname: players.surname,
          username: players.username,
        })
        .from(leagueMembers)
        .innerJoin(players, eq(players.id, leagueMembers.playerId))
        .where(eq(leagueMembers.leagueId, league))
        .orderBy(asc(leagueMembers.id)),
    )
    .map(({ member, ...person }) => ({ member: readMember(member), person }));
}

/** The owner's full name (`$league->owner?->fullName()`), null with no owner. */
async function ownerNameOf(
  db: Executor,
  owner: PlayerId | null,
): Promise<string | null> {
  if (owner === null) return null;
  const [row] = ownerRows.parse(
    await db
      .select({ name: players.name, surname: players.surname })
      .from(players)
      .where(eq(players.id, keyOf(owner, 'player'))),
  );
  return row === undefined ? null : accountFullName(row);
}

/**
 * `/leagues/{id}/payments` (LeaguePaymentController::edit): the page's data,
 * for an admin of a private league only (`mayManagePayments`). Read with no
 * lock; the actor's membership is read now, never from the session.
 */
export async function loadPaymentsPage(
  db: Executor,
  query: {
    readonly actor: PaymentsActor;
    readonly league: LeagueId;
    readonly rules: RuleSet;
  },
): Promise<PaymentsAnswer<PaymentsPage>> {
  const door = await doorOf(db, query.actor, false);
  if (!door.ok) return door;
  const found = await findLeague(db, query.league);
  if (found === null || !opensLeagueOf(door.value, found.tournament)) {
    return refuse('no-such-league');
  }
  const members = await accountsOf(db, query.league);
  const allowed = mayManagePayments({
    league: found.league,
    actorMember: asActor(
      members.map(({ member }) => member),
      door.value,
    ),
    superadmin: door.value.superadmin,
  });
  if (!allowed.ok) return allowed;
  const { kind } = found.league;
  return ok(
    paymentsPage({
      league: found.league,
      members,
      rules: query.rules,
      ownerName: await ownerNameOf(db, kind.public ? null : kind.owner),
    }),
  );
}
