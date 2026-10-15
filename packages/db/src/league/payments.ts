import {
  accountFullName,
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

const asActor = (
  members: readonly LeagueMember[],
  actor: PlayerId,
): LeagueMember | null =>
  members.find((member) => member.player === actor) ?? null;

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
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly entry: PaymentsEntry;
    readonly rules: RuleSet;
  },
): Promise<PaymentsAnswer<PaymentTotals, 'unknown-member'>> {
  return db.transaction(
    async (tx): Promise<PaymentsAnswer<PaymentTotals, 'unknown-member'>> => {
      const locked = await lockLeague(tx, save.league, 'share');
      if (locked === null) return refuse('no-such-league');
      const members = await lockMembers(tx, save.league);
      const decided = recordPayments({
        league: locked.league,
        actorMember: asActor(members, save.actor),
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
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly entry: DetailsEntry;
  },
): Promise<PaymentsAnswer<void>> {
  return db.transaction(async (tx): Promise<PaymentsAnswer<void>> => {
    const locked = await lockLeague(tx, save.league, 'update');
    if (locked === null) return refuse('no-such-league');
    const allowed = mayManagePayments({
      league: locked.league,
      actorMember: await lockMember(tx, save.league, save.actor, 'share'),
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
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly rules: RuleSet;
  },
): Promise<PaymentsAnswer<PaymentsPage>> {
  const found = await findLeague(db, query.league);
  if (found === null) return refuse('no-such-league');
  const members = await accountsOf(db, query.league);
  const allowed = mayManagePayments({
    league: found.league,
    actorMember: asActor(
      members.map(({ member }) => member),
      query.actor,
    ),
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
